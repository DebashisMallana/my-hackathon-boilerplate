const { withTransaction } = require('../db/transaction');

const definitions = {
    receipts: {
        table: 'receipts', itemTable: 'receipt_items', key: 'receipt_id',
        createColumns: ['supplier_name', 'warehouse_id'], createValues: (d) => [d.supplierName, d.warehouseId],
        itemValues: (i) => [i.productId, i.locationId, i.quantity], locations: true
    },
    deliveries: {
        table: 'deliveries', itemTable: 'delivery_items', key: 'delivery_id',
        createColumns: ['warehouse_id'], createValues: (d) => [d.warehouseId],
        itemValues: (i) => [i.productId, i.locationId, i.quantity], locations: true
    },
    transfers: {
        table: 'transfers', itemTable: 'transfer_items', key: 'transfer_id',
        createColumns: ['from_location_id', 'to_location_id'], createValues: (d) => [d.fromLocationId, d.toLocationId],
        itemValues: (i) => [i.productId, i.quantity], locations: false
    },
    adjustments: {
        table: 'adjustments', itemTable: 'adjustment_items', key: 'adjustment_id',
        createColumns: ['location_id'], createValues: (d) => [d.locationId],
        itemValues: (i) => [i.productId, i.countedQuantity], locations: false
    }
};

function bad(message, status = 400) { const e = new Error(message); e.status = status; return e; }

function createDocument(pool, kind) {
    const d = definitions[kind];
    return async (req, res, next) => {
        try {
            const result = await withTransaction(pool, async (client) => {
                const data = req.validated.body;
                const created = await client.query(
                    `INSERT INTO ${d.table} (${d.createColumns.join(', ')}) VALUES (${d.createColumns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
                    d.createValues(data)
                );
                const id = created.rows[0].id;
                for (const item of data.items) {
                    if (d.locations) {
                        const location = await client.query(
                            'SELECT id FROM locations WHERE id = $1 AND warehouse_id = $2',
                            [item.locationId, data.warehouseId]
                        );
                        if (!location.rows.length) throw bad('Item location does not belong to document warehouse');
                    }
                    const values = d.itemValues(item);
                    const cols = d.locations ? [d.key, 'product_id', 'location_id', 'quantity'] : kind === 'adjustments' ? [d.key, 'product_id', 'counted_quantity'] : [d.key, 'product_id', 'quantity'];
                    await client.query(`INSERT INTO ${d.itemTable} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, [id, ...values]);
                }
                return created.rows[0];
            });
            res.status(201).json({ document: result });
        } catch (error) { next(error); }
    };
}

function addItem(pool, kind) {
    const d = definitions[kind];
    return async (req, res, next) => {
        try {
            const item = req.validated.body;
            const result = await withTransaction(pool, async (client) => {
                const doc = await client.query(`SELECT * FROM ${d.table} WHERE id = $1 FOR UPDATE`, [req.validated.params.id]);
                if (!doc.rows.length) throw bad('Document not found', 404);
                if (doc.rows[0].status !== 'DRAFT') throw bad('Only DRAFT documents can be changed');
                if (d.locations && !item.locationId) throw bad('locationId is required');
                if (d.locations) {
                    const location = await client.query(
                        'SELECT id FROM locations WHERE id = $1 AND warehouse_id = $2',
                        [item.locationId, doc.rows[0].warehouse_id]
                    );
                    if (!location.rows.length) throw bad('Item location does not belong to document warehouse');
                }
                const values = d.itemValues(item);
                const cols = d.locations ? [d.key, 'product_id', 'location_id', 'quantity'] : kind === 'adjustments' ? [d.key, 'product_id', 'counted_quantity'] : [d.key, 'product_id', 'quantity'];
                const inserted = await client.query(`INSERT INTO ${d.itemTable} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, [req.validated.params.id, ...values]);
                return inserted.rows[0];
            });
            res.status(201).json({ item: result });
        } catch (error) { next(error); }
    };
}

async function lockStock(client, productId, locationId, create) {
    let result = await client.query('SELECT id, quantity FROM stock WHERE product_id = $1 AND location_id = $2 FOR UPDATE', [productId, locationId]);
    if (!result.rows.length && create) {
        await client.query('INSERT INTO stock (product_id, location_id, quantity) VALUES ($1, $2, 0) ON CONFLICT (product_id, location_id) DO NOTHING', [productId, locationId]);
        result = await client.query('SELECT id, quantity FROM stock WHERE product_id = $1 AND location_id = $2 FOR UPDATE', [productId, locationId]);
    }
    return result.rows[0] || null;
}

function validateDocument(pool, kind) {
    const d = definitions[kind];
    return async (req, res, next) => {
        try {
            await withTransaction(pool, async (client) => {
                const docResult = await client.query(`SELECT * FROM ${d.table} WHERE id = $1 FOR UPDATE`, [req.validated.params.id]);
                if (!docResult.rows.length) throw bad('Document not found', 404);
                const doc = docResult.rows[0];
                if (doc.status === 'DONE') throw bad('Document has already been validated', 409);
                if (doc.status === 'CANCELED') throw bad('Canceled documents cannot be validated');
                const itemResult = await client.query(`SELECT * FROM ${d.itemTable} WHERE ${d.key} = $1 ORDER BY product_id, id`, [doc.id]);
                if (!itemResult.rows.length) throw bad('Document must contain at least one item');
                if (kind === 'transfers' && doc.from_location_id === doc.to_location_id) throw bad('Source and destination must differ');
                if (kind === 'receipts' || kind === 'deliveries') {
                    const warehouseId = doc.warehouse_id;
                    for (const item of itemResult.rows) {
                        const location = await client.query('SELECT id FROM locations WHERE id = $1 AND warehouse_id = $2', [item.location_id, warehouseId]);
                        if (!location.rows.length) throw bad('Item location does not belong to document warehouse');
                    }
                }
                for (const item of itemResult.rows) {
                    if (kind === 'receipts') {
                        await lockStock(client, item.product_id, item.location_id, true);
                        await client.query('UPDATE stock SET quantity = quantity + $1 WHERE product_id = $2 AND location_id = $3', [item.quantity, item.product_id, item.location_id]);
                        await client.query("INSERT INTO stock_ledger (product_id, location_id, quantity_change, movement_type, reference_type, reference_id) VALUES ($1, $2, $3, 'RECEIPT', 'RECEIPT', $4)", [item.product_id, item.location_id, item.quantity, doc.id]);
                    } else if (kind === 'deliveries') {
                        const stock = await lockStock(client, item.product_id, item.location_id, false);
                        if (!stock || Number(stock.quantity) < Number(item.quantity)) throw bad('Insufficient stock');
                        await client.query('UPDATE stock SET quantity = quantity - $1 WHERE product_id = $2 AND location_id = $3', [item.quantity, item.product_id, item.location_id]);
                        await client.query("INSERT INTO stock_ledger (product_id, location_id, quantity_change, movement_type, reference_type, reference_id) VALUES ($1, $2, $3, 'DELIVERY', 'DELIVERY', $4)", [item.product_id, item.location_id, -Number(item.quantity), doc.id]);
                    } else if (kind === 'transfers') {
                        const locations = [doc.from_location_id, doc.to_location_id].sort((a, b) => a - b);
                        const locked = {};
                        for (const locationId of locations) locked[locationId] = await lockStock(client, item.product_id, locationId, true);
                        const source = locked[doc.from_location_id];
                        if (!source || Number(source.quantity) < Number(item.quantity)) throw bad('Insufficient stock');
                        await client.query('UPDATE stock SET quantity = quantity - $1 WHERE product_id = $2 AND location_id = $3', [item.quantity, item.product_id, doc.from_location_id]);
                        await client.query('UPDATE stock SET quantity = quantity + $1 WHERE product_id = $2 AND location_id = $3', [item.quantity, item.product_id, doc.to_location_id]);
                        await client.query("INSERT INTO stock_ledger (product_id, location_id, quantity_change, movement_type, reference_type, reference_id) VALUES ($1, $2, $3, 'TRANSFER_OUT', 'TRANSFER', $4), ($1, $5, $3, 'TRANSFER_IN', 'TRANSFER', $4)", [item.product_id, doc.from_location_id, -Number(item.quantity), doc.id, doc.to_location_id]);
                    } else {
                        const stock = await lockStock(client, item.product_id, doc.location_id, true);
                        const current = stock ? Number(stock.quantity) : 0;
                        const difference = Number(item.counted_quantity) - current;
                        await client.query('UPDATE stock SET quantity = $1 WHERE product_id = $2 AND location_id = $3', [item.counted_quantity, item.product_id, doc.location_id]);
                        await client.query("INSERT INTO stock_ledger (product_id, location_id, quantity_change, movement_type, reference_type, reference_id) VALUES ($1, $2, $3, 'ADJUSTMENT', 'ADJUSTMENT', $4)", [item.product_id, doc.location_id, difference, doc.id]);
                    }
                }
                await client.query(`UPDATE ${d.table} SET status = 'DONE' WHERE id = $1`, [doc.id]);
            });
            res.json({ message: 'Document validated successfully' });
        } catch (error) { next(error); }
    };
}

module.exports = { createDocument, addItem, validateDocument, lockStock };

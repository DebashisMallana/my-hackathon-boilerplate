const productSelect = `
    SELECT
        p.id,
        p.name,
        p.sku,
        p.category_id,
        c.name AS category,
        p.unit_id,
        u.code AS unit,
        COALESCE(SUM(s.quantity), 0) AS total_stock
    FROM products p
    JOIN categories c ON p.category_id = c.id
    JOIN units_of_measure u ON p.unit_id = u.id
    LEFT JOIN stock s ON s.product_id = p.id
`;

function databaseError(error, fallback) {
    if (error.code === '23505') {
        return { status: 409, body: { error: 'A product with this SKU already exists' } };
    }
    if (error.code === '23503') {
        return { status: 400, body: { error: 'Invalid categoryId or unitId' } };
    }
    console.error(fallback, error);
    return { status: 500, body: { error: fallback } };
}

function listProducts(pool) {
    return async (req, res, next) => {
        const { search, categoryId, unitId } = req.validated.query;
        const conditions = [];
        const values = [];

        if (search) {
            values.push(`%${search}%`);
            conditions.push(`(p.name ILIKE $${values.length} OR p.sku ILIKE $${values.length})`);
        }
        if (categoryId !== undefined) {
            values.push(categoryId);
            conditions.push(`p.category_id = $${values.length}`);
        }
        if (unitId !== undefined) {
            values.push(unitId);
            conditions.push(`p.unit_id = $${values.length}`);
        }

        try {
            const result = await pool.query(`
                ${productSelect}
                ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
                GROUP BY p.id, c.name, u.code
                ORDER BY p.name
            `, values);
            return res.json(result.rows);
        } catch (error) {
            return next(error);
        }
    };
}

function getProduct(pool) {
    return async (req, res, next) => {
        try {
            const result = await pool.query(`
                ${productSelect}
                WHERE p.id = $1
                GROUP BY p.id, c.name, u.code
            `, [req.validated.params.id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Product not found' });
            }
            return res.json(result.rows[0]);
        } catch (error) {
            return next(error);
        }
    };
}

function createProduct(pool) {
    return async (req, res) => {
        const { name, sku, categoryId, unitId } = req.body;
        try {
            const result = await pool.query(`
                INSERT INTO products (name, sku, category_id, unit_id)
                VALUES ($1, $2, $3, $4)
                RETURNING id, name, sku, category_id, unit_id
            `, [name, sku, categoryId, unitId]);
            return res.status(201).json({
                message: 'Product created successfully',
                product: result.rows[0]
            });
        } catch (error) {
            const response = databaseError(error, 'Unable to create product');
            return res.status(response.status).json(response.body);
        }
    };
}

function updateProduct(pool) {
    return async (req, res) => {
        const fields = [];
        const values = [];
        const columns = { name: 'name', sku: 'sku', categoryId: 'category_id', unitId: 'unit_id' };

        for (const [field, value] of Object.entries(req.body)) {
            fields.push(`${columns[field]} = $${values.length + 1}`);
            values.push(value);
        }
        values.push(req.validated.params.id);

        try {
            const result = await pool.query(`
                UPDATE products
                SET ${fields.join(', ')}, updated_at = now()
                WHERE id = $${values.length}
                RETURNING id, name, sku, category_id, unit_id
            `, values);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Product not found' });
            }
            return res.json({
                message: 'Product updated successfully',
                product: result.rows[0]
            });
        } catch (error) {
            const response = databaseError(error, 'Unable to update product');
            return res.status(response.status).json(response.body);
        }
    };
}

function listCategories(pool) {
    return async (req, res, next) => {
        try {
            const result = await pool.query('SELECT id, name FROM categories ORDER BY name');
            return res.json(result.rows);
        } catch (error) {
            return next(error);
        }
    };
}

function listUnits(pool) {
    return async (req, res, next) => {
        try {
            const result = await pool.query('SELECT id, name, code FROM units_of_measure ORDER BY name');
            return res.json(result.rows);
        } catch (error) {
            return next(error);
        }
    };
}

module.exports = {
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    listCategories,
    listUnits
};

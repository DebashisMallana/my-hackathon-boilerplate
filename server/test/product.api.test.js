const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const createApp = require('../app');

function createTestServer() {
    const queries = [];
    const pool = {
        queries,
        async query(text, values = []) {
            queries.push({ text, values });

            if (text.includes('FROM categories')) {
                return { rows: [{ id: 1, name: 'Raw Materials' }] };
            }
            if (text.includes('FROM units_of_measure')) {
                return { rows: [{ id: 1, name: 'Pieces', code: 'PCS' }] };
            }
            if (text.includes('INSERT INTO products')) {
                return { rows: [{ id: 4, name: values[0], sku: values[1], category_id: values[2], unit_id: values[3] }] };
            }
            if (text.includes('UPDATE products')) {
                return { rows: [{ id: values.at(-1), name: 'Updated', sku: 'SKU-4', category_id: 1, unit_id: 1 }] };
            }
            return { rows: [{ id: 1, name: 'Steel Rod', sku: 'STL001', category_id: 1, category: 'Raw Materials', unit_id: 2, unit: 'KG', total_stock: '50' }] };
        }
    };
    const server = http.createServer(createApp({ pool }));
    return { server, queries };
}

async function request(server, path, options = {}) {
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
    const body = await response.json();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    return { response, body };
}

test('preserves product listing and passes search filters as parameters', async () => {
    const { server, queries } = createTestServer();
    const { response, body } = await request(server, '/api/products?search=steel&categoryId=1');

    assert.equal(response.status, 200);
    assert.equal(body[0].sku, 'STL001');
    assert.deepEqual(queries[0].values, ['%steel%', 1]);
});

test('validates product route IDs centrally', async () => {
    const { server } = createTestServer();
    const { response, body } = await request(server, '/api/products/not-an-id');

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Validation failed');
});

test('preserves product creation and PATCH behavior', async () => {
    const create = createTestServer();
    const created = await request(create.server, '/api/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Copper Wire', sku: 'COP002', categoryId: 1, unitId: 2 })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.product.sku, 'COP002');

    const update = createTestServer();
    const updated = await request(update.server, '/api/products/4', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.product.id, 4);
});

test('returns consistent validation and malformed JSON errors', async () => {
    const invalid = createTestServer();
    const invalidResponse = await request(invalid.server, '/api/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '', sku: 'SKU', categoryId: 1 })
    });
    assert.equal(invalidResponse.response.status, 400);
    assert.equal(invalidResponse.body.error, 'Validation failed');

    const malformed = createTestServer();
    const malformedResponse = await request(malformed.server, '/api/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name":'
    });
    assert.equal(malformedResponse.response.status, 400);
    assert.equal(malformedResponse.body.error, 'Malformed JSON request body');
});

test('exposes category and unit reference data', async () => {
    const categories = createTestServer();
    const categoryResponse = await request(categories.server, '/api/categories');
    assert.equal(categoryResponse.response.status, 200);
    assert.equal(categoryResponse.body[0].name, 'Raw Materials');

    const units = createTestServer();
    const unitResponse = await request(units.server, '/api/units');
    assert.equal(unitResponse.response.status, 200);
    assert.equal(unitResponse.body[0].code, 'PCS');
});

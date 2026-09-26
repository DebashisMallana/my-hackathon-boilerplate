require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');
const {
    productSchema,
    productUpdateSchema
} = require('./validators/product.validator');

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 5000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- ROUTES ---

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Hackathon backend is alive and ready!'
    });
});

// Get all products with total stock
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.id,
                p.name,
                p.sku,
                c.name AS category,
                u.code AS unit,
                COALESCE(SUM(s.quantity), 0) AS total_stock
            FROM products p
            JOIN categories c ON p.category_id = c.id
            JOIN units_of_measure u ON p.unit_id = u.id
            LEFT JOIN stock s ON s.product_id = p.id
            GROUP BY p.id, c.name, u.code
            ORDER BY p.name
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Failed to fetch products:', error);

        res.status(500).json({
            error: 'Unable to fetch products'
        });
    }
});

// Get a single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const productId = Number(req.params.id);

        // Validate that the ID is an integer
        if (!Number.isInteger(productId)) {
            return res.status(400).json({
                error: 'Product ID must be an integer'
            });
        }

        const result = await pool.query(
            `
            SELECT
                p.id,
                p.name,
                p.sku,
                c.name AS category,
                u.code AS unit,
                COALESCE(SUM(s.quantity), 0) AS total_stock
            FROM products p
            JOIN categories c ON p.category_id = c.id
            JOIN units_of_measure u ON p.unit_id = u.id
            LEFT JOIN stock s ON s.product_id = p.id
            WHERE p.id = $1
            GROUP BY p.id, c.name, u.code
            `,
            [productId]
        );

        // Product doesn't exist
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Product not found'
            });
        }

        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error('Failed to fetch product:', error);

        res.status(500).json({
            error: 'Unable to fetch product'
        });
    }
});

// Create a new product
app.post('/api/products', async (req, res) => {
    // Validate request body with Zod
    const validation = productSchema.safeParse(req.body);

    if (!validation.success) {
        return res.status(400).json({
            error: 'Validation failed',
            details: validation.error.issues.map(issue => issue.message)
        });
    }

    // Get validated data
    const { name, sku, categoryId, unitId } = validation.data;

    try {
        // Insert product into PostgreSQL
        const result = await pool.query(
            `
            INSERT INTO products (
                name,
                sku,
                category_id,
                unit_id
            )
            VALUES ($1, $2, $3, $4)
            RETURNING
                id,
                name,
                sku,
                category_id,
                unit_id
            `,
            [name, sku, categoryId, unitId]
        );

        // Send created product back to client
        res.status(201).json({
            message: 'Product created successfully',
            product: result.rows[0]
        });

    } catch (error) {
        console.error('Failed to create product:', error);

        // Duplicate SKU
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'A product with this SKU already exists'
            });
        }

        // Foreign key violation
        if (error.code === '23503') {
            return res.status(400).json({
                error: 'Invalid categoryId or unitId'
            });
        }

        res.status(500).json({
            error: 'Unable to create product'
        });
    }
});

// Update an existing product
app.patch('/api/products/:id', async (req, res) => {
    // 1. Validate product ID
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId)) {
        return res.status(400).json({
            error: 'Product ID must be an integer'
        });
    }

    // 2. Validate request body
    const validation = productUpdateSchema.safeParse(req.body);

    if (!validation.success) {
        return res.status(400).json({
            error: 'Validation failed',
            details: validation.error.issues.map(issue => issue.message)
        });
    }

    const updates = validation.data;

    try {
        // 3. Check whether the product exists
        const existingProduct = await pool.query(
            'SELECT id FROM products WHERE id = $1',
            [productId]
        );

        if (existingProduct.rows.length === 0) {
            return res.status(404).json({
                error: 'Product not found'
            });
        }

        // 4. Build the UPDATE query dynamically
        const fields = [];
        const values = [];
        let parameterIndex = 1;

        if (updates.name !== undefined) {
            fields.push(`name = $${parameterIndex}`);
            values.push(updates.name);
            parameterIndex++;
        }

        if (updates.sku !== undefined) {
            fields.push(`sku = $${parameterIndex}`);
            values.push(updates.sku);
            parameterIndex++;
        }

        if (updates.categoryId !== undefined) {
            fields.push(`category_id = $${parameterIndex}`);
            values.push(updates.categoryId);
            parameterIndex++;
        }

        if (updates.unitId !== undefined) {
            fields.push(`unit_id = $${parameterIndex}`);
            values.push(updates.unitId);
            parameterIndex++;
        }

        values.push(productId);

        const result = await pool.query(
            `
            UPDATE products
            SET ${fields.join(', ')}
            WHERE id = $${parameterIndex}
            RETURNING
                id,
                name,
                sku,
                category_id,
                unit_id
            `,
            values
        );

        res.status(200).json({
            message: 'Product updated successfully',
            product: result.rows[0]
        });

    } catch (error) {
        console.error('Failed to update product:', error);

        // Duplicate SKU
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'A product with this SKU already exists'
            });
        }

        // Invalid category/unit
        if (error.code === '23503') {
            return res.status(400).json({
                error: 'Invalid categoryId or unitId'
            });
        }

        res.status(500).json({
            error: 'Unable to update product'
        });
    }
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:5000`);
});
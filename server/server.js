require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');

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

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
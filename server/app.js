const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/product.routes');
const documentRoutes = require('./routes/document.routes');

function createApp({ pool }) {
    const app = express();

    app.use(cors());
    app.use(express.json());

    app.get('/api/health', (req, res) => {
        res.status(200).json({
            status: 'success',
            message: 'Hackathon backend is alive and ready!'
        });
    });

    app.use('/api', productRoutes({ pool }));
    app.use('/api', documentRoutes({ pool }));

    app.use((req, res) => {
        res.status(404).json({ error: 'Route not found' });
    });

    app.use((error, req, res, next) => {
        if (error.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Malformed JSON request body' });
        }

        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        if (error.code === '23503') {
            return res.status(400).json({ error: 'Invalid product, location, or document relationship' });
        }
        if (error.code === '23514') {
            return res.status(400).json({ error: 'Request violates a database constraint' });
        }

        console.error('Unhandled request error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    });

    return app;
}

module.exports = createApp;

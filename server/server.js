const express = require('express');
const cors = require('cors');

// Initialize the Express application
const app = express();
const PORT = 5000;

// --- MIDDLEWARE ---
// 1. Enable CORS so your React frontend can communicate with this API
app.use(cors()); 
// 2. Parse incoming JSON payloads (crucial for POST/PUT requests)
app.use(express.json()); 

// --- ROUTES ---
// A simple GET endpoint to test if our API is alive
app.get('/api/health', (req, res) => {
    // We return a 200 OK status and a JSON object
    res.status(200).json({ 
        status: 'success', 
        message: 'Hackathon backend is alive and ready!' 
    });
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
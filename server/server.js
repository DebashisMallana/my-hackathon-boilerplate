require('dotenv').config();

const pool = require('./db/pool');
const createApp = require('./app');
const PORT = process.env.PORT || 5000;

const app = createApp({ pool });

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
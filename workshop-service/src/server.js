const app = require('./app');
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Workshop Service berjalan di http://localhost:${port} (docs: /docs)`));

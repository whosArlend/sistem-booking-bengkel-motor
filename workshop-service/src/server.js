const app = require('./app');
const port = process.env.PORT || 4000;

if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`Workshop Service berjalan di http://localhost:${port} (docs: /docs)`));
}

module.exports = app;


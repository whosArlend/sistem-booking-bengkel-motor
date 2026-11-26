// Halaman Swagger UI via CDN (aman untuk Vercel serverless, tanpa file statis)
module.exports = `<!doctype html><html><head><meta charset="utf-8"><title>API Docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: 'openapi.json', dom_id: '#swagger-ui' });</script></body></html>`;

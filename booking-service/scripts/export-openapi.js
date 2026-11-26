// npm run docs -> menulis docs/openapi.json (bisa diimpor ke Postman)
const fs = require('fs');
fs.writeFileSync(__dirname + '/../docs/openapi.json', JSON.stringify(require('../src/openapi'), null, 2));
console.log('docs/openapi.json dibuat');

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const crud = require('./crud');
const slotReserve = require('./slotReserve');
const spec = require('./openapi');
const docsHtml = require('./docs');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ service: 'workshop-service', docs: '/docs' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/openapi.json', (req, res) => res.json(spec));
app.get('/docs', (req, res) => res.type('html').send(docsHtml));

// Operasi tulis wajib API key jika INTERNAL_API_KEY diatur
app.use((req, res, next) => {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || req.method === 'GET') return next();
  if (req.get('x-api-key') !== key) return res.status(401).json({ error: 'API key tidak valid' });
  next();
});

app.use('/services', crud(pool, 'services', {
  fields: ['name', 'description', 'price', 'duration_minutes'],
  required: ['name', 'price', 'duration_minutes'],
}));
app.use('/mechanics', crud(pool, 'mechanics', {
  fields: ['name', 'specialization', 'is_active'],
  required: ['name'],
}));
app.use('/slots', slotReserve(pool), crud(pool, 'slots', {
  fields: ['mechanic_id', 'slot_date', 'start_time', 'end_time', 'is_booked'],
  required: ['mechanic_id', 'slot_date', 'start_time', 'end_time'],
  filters: ['mechanic_id', 'slot_date', 'is_booked'],
}));

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));
app.use(crud.errorHandler);

module.exports = app;

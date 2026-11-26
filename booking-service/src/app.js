require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const crud = require('./crud');
const bookings = require('./bookings');
const spec = require('./openapi');
const docsHtml = require('./docs');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ service: 'booking-service', docs: '/docs' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/openapi.json', (req, res) => res.json(spec));
app.get('/docs', (req, res) => res.type('html').send(docsHtml));

app.use('/customers', crud(pool, 'customers', {
  fields: ['name', 'phone', 'email'],
  required: ['name', 'phone'],
}));
app.use('/motorcycles', crud(pool, 'motorcycles', {
  fields: ['customer_id', 'plate_number', 'brand', 'model', 'year'],
  required: ['customer_id', 'plate_number'],
  filters: ['customer_id'],
}));
app.use('/bookings', bookings);

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));
app.use(crud.errorHandler);

module.exports = app;

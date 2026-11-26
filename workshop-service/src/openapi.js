const { err, entity, crudPaths } = require('./openapiHelpers');

const service = entity({
  name: { type: 'string', example: 'Ganti Oli' },
  description: { type: 'string' },
  price: { type: 'number', example: 55000 },
  duration_minutes: { type: 'integer', example: 30 },
}, ['name', 'price', 'duration_minutes']);

const mechanic = entity({
  name: { type: 'string', example: 'Budi' },
  specialization: { type: 'string', example: 'Mesin' },
  is_active: { type: 'boolean' },
}, ['name']);

const slot = entity({
  mechanic_id: { type: 'integer' },
  slot_date: { type: 'string', format: 'date', example: '2026-12-01' },
  start_time: { type: 'string', example: '09:00:00' },
  end_time: { type: 'string', example: '10:00:00' },
  is_booked: { type: 'boolean' },
}, ['mechanic_id', 'slot_date', 'start_time', 'end_time']);

const paths = {
  ...crudPaths('Services', '/services', 'Service'),
  ...crudPaths('Mechanics', '/mechanics', 'Mechanic'),
  ...crudPaths('Slots', '/slots', 'Slot', ['mechanic_id', 'slot_date', 'is_booked']),
};
// Catatan perilaku khusus PUT /slots/{id}
paths['/slots/{id}'].put.description =
  'Jika body berisi {"is_booked": true}, slot dipesan secara atomik; 409 jika sudah terisi. Dipakai Booking Service.';
paths['/slots/{id}'].put.responses[409] = err('Slot sudah dibooking');

module.exports = {
  openapi: '3.0.3',
  info: { title: 'Workshop Service API', version: '1.0.0', description: 'Data master bengkel: layanan servis, mekanik, dan slot jadwal.' },
  servers: [{ url: process.env.PUBLIC_URL || 'http://localhost:4000' }],
  tags: [{ name: 'Services' }, { name: 'Mechanics' }, { name: 'Slots' }],
  security: [{ ApiKeyAuth: [] }],
  paths,
  components: {
    securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key', description: 'Wajib untuk POST/PUT/DELETE bila INTERNAL_API_KEY diatur' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      Service: service.schema, ServiceInput: service.input,
      Mechanic: mechanic.schema, MechanicInput: mechanic.input,
      Slot: slot.schema, SlotInput: slot.input,
    },
  },
};

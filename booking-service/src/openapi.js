const { ref, json, err, idParam, entity, crudPaths } = require('./openapiHelpers');

const customer = entity({
  name: { type: 'string', example: 'Andi Pratama' },
  phone: { type: 'string', example: '081234567890' },
  email: { type: 'string', example: 'andi@mail.com' },
}, ['name', 'phone']);

const motorcycle = entity({
  customer_id: { type: 'integer' },
  plate_number: { type: 'string', example: 'H 1234 AB' },
  brand: { type: 'string', example: 'Honda' },
  model: { type: 'string', example: 'Beat' },
  year: { type: 'integer', example: 2020 },
}, ['customer_id', 'plate_number']);

const bookingProps = {
  customer_id: { type: 'integer' },
  motorcycle_id: { type: 'integer' },
  service_id: { type: 'integer', description: 'ID layanan di Workshop Service' },
  slot_id: { type: 'integer', description: 'ID slot di Workshop Service' },
  complaint_note: { type: 'string', example: 'Mesin kasar saat digas' },
};
const statusEnum = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

const bookingFilters = ['status', 'customer_id', 'motorcycle_id'].map((n) => ({ name: n, in: 'query', schema: { type: 'string' } }));
const bookingPaths = {
  '/bookings': {
    get: { tags: ['Bookings'], summary: 'Daftar booking', parameters: bookingFilters, responses: { 200: { description: 'OK', ...json({ type: 'array', items: ref('Booking') }) } } },
    post: {
      tags: ['Bookings'], summary: 'Buat booking',
      description: 'Memvalidasi layanan (GET /services/{id}) dan memesan slot (PUT /slots/{id}) di Workshop Service.',
      requestBody: { required: true, ...json(ref('BookingCreate')) },
      responses: { 201: { description: 'Dibuat', ...json(ref('BookingDetail')) }, 400: err('Data tidak valid'), 404: err('Layanan/slot tidak ada'), 409: err('Slot sudah dibooking'), 502: err('Workshop Service tidak dapat dihubungi') },
    },
  },
  '/bookings/{id}': {
    get: { tags: ['Bookings'], summary: 'Detail booking (digabung data Workshop Service)', parameters: [idParam], responses: { 200: { description: 'OK', ...json(ref('BookingDetail')) }, 404: err('Tidak ditemukan') } },
    put: { tags: ['Bookings'], summary: 'Ubah status / catatan / jadwal (reschedule)', parameters: [idParam], requestBody: { required: true, ...json(ref('BookingUpdate')) }, responses: { 200: { description: 'Diubah', ...json(ref('BookingDetail')) }, 400: err('Data tidak valid'), 404: err('Tidak ditemukan'), 409: err('Slot baru sudah dibooking') } },
    delete: { tags: ['Bookings'], summary: 'Batalkan/hapus booking dan buka kembali slot', parameters: [idParam], responses: { 200: { description: 'Dihapus' }, 404: err('Tidak ditemukan') } },
  },
};

module.exports = {
  openapi: '3.0.3',
  info: { title: 'Booking Service API', version: '1.0.0', description: 'Pelanggan, motor, dan booking servis. Berkomunikasi dengan Workshop Service lewat REST.' },
  servers: [{ url: process.env.PUBLIC_URL || 'http://localhost:3000' }],
  tags: [{ name: 'Customers' }, { name: 'Motorcycles' }, { name: 'Bookings' }],
  paths: {
    ...crudPaths('Customers', '/customers', 'Customer'),
    ...crudPaths('Motorcycles', '/motorcycles', 'Motorcycle', ['customer_id']),
    ...bookingPaths,
  },
  components: {
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      Customer: customer.schema, CustomerInput: customer.input,
      Motorcycle: motorcycle.schema, MotorcycleInput: motorcycle.input,
      BookingCreate: { type: 'object', required: ['customer_id', 'motorcycle_id', 'service_id', 'slot_id'], properties: bookingProps },
      BookingUpdate: { type: 'object', properties: { status: { type: 'string', enum: statusEnum }, complaint_note: { type: 'string' }, slot_id: { type: 'integer', description: 'Isi untuk reschedule' } } },
      Booking: { type: 'object', properties: { id: { type: 'integer' }, ...bookingProps, status: { type: 'string', enum: statusEnum }, created_at: { type: 'string', format: 'date-time' } } },
      BookingDetail: { allOf: [ref('Booking'), { type: 'object', properties: { service: { type: 'object', nullable: true }, slot: { type: 'object', nullable: true }, mechanic: { type: 'object', nullable: true } } }] },
    },
  },
};

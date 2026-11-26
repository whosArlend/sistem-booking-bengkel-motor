const express = require('express');
const pool = require('./db');
const workshop = require('./workshopClient');

const STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
const httpError = (status, message) => Object.assign(new Error(message), { status });
const checkId = (req, res, next, id) => (/^\d+$/.test(id) ? next() : res.status(400).json({ error: 'ID harus berupa angka' }));
const r = express.Router();
r.param('id', checkId);

// Gabungkan data booking dengan data layanan, slot, dan mekanik dari Workshop Service
async function enrich(b) {
  const [service, slot] = await Promise.all([
    workshop.getService(b.service_id).catch(() => null),
    workshop.getSlot(b.slot_id).catch(() => null),
  ]);
  const mechanic = slot ? await workshop.getMechanic(slot.mechanic_id).catch(() => null) : null;
  return { ...b, service, slot, mechanic };
}

r.get('/', async (req, res, next) => {
  try {
    const where = [], values = [];
    for (const f of ['status', 'customer_id', 'motorcycle_id']) {
      if (req.query[f] !== undefined) { values.push(req.query[f]); where.push(`${f} = $${values.length}`); }
    }
    const sql = `SELECT * FROM bookings${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
    res.json((await pool.query(sql, values)).rows);
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!rows.length) throw httpError(404, 'Booking tidak ditemukan');
    res.json(await enrich(rows[0]));
  } catch (e) { next(e); }
});

// Buat booking: validasi layanan (GET) -> reservasi slot (PUT) -> simpan booking
r.post('/', async (req, res, next) => {
  let reserved = null;
  try {
    const { customer_id, motorcycle_id, service_id, slot_id, complaint_note } = req.body;
    if (![customer_id, motorcycle_id, service_id, slot_id].every(Boolean)) {
      throw httpError(400, 'customer_id, motorcycle_id, service_id, dan slot_id wajib diisi');
    }
    const m = await pool.query('SELECT 1 FROM motorcycles WHERE id = $1 AND customer_id = $2', [motorcycle_id, customer_id]);
    if (!m.rowCount) throw httpError(400, 'Motor tidak ditemukan untuk pelanggan tersebut');

    await workshop.getService(service_id);   // 404 jika layanan tidak ada
    await workshop.reserveSlot(slot_id);     // 409 jika slot sudah terisi
    reserved = slot_id;

    const { rows } = await pool.query(
      `INSERT INTO bookings (customer_id, motorcycle_id, service_id, slot_id, complaint_note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [customer_id, motorcycle_id, service_id, slot_id, complaint_note ?? null]
    );
    reserved = null; // berhasil, jangan di-rollback
    res.status(201).json(await enrich(rows[0]));
  } catch (e) {
    if (reserved) await workshop.releaseSlot(reserved).catch(() => {}); // kompensasi
    next(e);
  }
});

// Ubah status / catatan / jadwal (reschedule)
r.put('/:id', async (req, res, next) => {
  let newSlot = null, saved = false;
  try {
    const cur = (await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id])).rows[0];
    if (!cur) throw httpError(404, 'Booking tidak ditemukan');
    const { status, complaint_note, slot_id } = req.body;
    if (status && !STATUSES.includes(status)) throw httpError(400, `status harus salah satu dari: ${STATUSES.join(', ')}`);

    if (slot_id && Number(slot_id) !== cur.slot_id) {
      await workshop.reserveSlot(slot_id);
      newSlot = Number(slot_id);
    }
    const { rows } = await pool.query(
      `UPDATE bookings SET status = COALESCE($1, status), complaint_note = COALESCE($2, complaint_note),
       slot_id = COALESCE($3, slot_id) WHERE id = $4 RETURNING *`,
      [status ?? null, complaint_note ?? null, newSlot, cur.id]
    );
    saved = true;
    if (newSlot) await workshop.releaseSlot(cur.slot_id).catch(() => {});
    else if (status === 'cancelled' && cur.status !== 'cancelled') await workshop.releaseSlot(cur.slot_id).catch(() => {});
    res.json(await enrich(rows[0]));
  } catch (e) {
    if (newSlot && !saved) await workshop.releaseSlot(newSlot).catch(() => {});
    next(e);
  }
});

// Batalkan/hapus booking dan buka kembali slotnya
r.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM bookings WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows.length) throw httpError(404, 'Booking tidak ditemukan');
    if (!['cancelled', 'completed'].includes(rows[0].status)) await workshop.releaseSlot(rows[0].slot_id).catch(() => {});
    res.json({ message: 'Booking dihapus', data: rows[0] });
  } catch (e) { next(e); }
});

module.exports = r;

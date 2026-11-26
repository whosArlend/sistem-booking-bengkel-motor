const express = require('express');

const checkId = (req, res, next, id) => (/^\d+$/.test(id) ? next() : res.status(400).json({ error: 'ID harus berupa angka' }));

// PUT /slots/:id dengan { is_booked: true } dijalankan secara ATOMIK:
// hanya berhasil jika slot masih kosong, sehingga dua booking tidak bisa memperebutkan slot yang sama.
module.exports = (pool) => {
  const r = express.Router();
  r.param('id', checkId);
  r.put('/:id', async (req, res, next) => {
    if (req.body.is_booked !== true) return next();
    try {
      const { rows } = await pool.query(
        'UPDATE slots SET is_booked = TRUE WHERE id = $1 AND is_booked = FALSE RETURNING *', [req.params.id]);
      if (rows.length) return res.json(rows[0]);
      const exists = await pool.query('SELECT 1 FROM slots WHERE id = $1', [req.params.id]);
      return exists.rowCount
        ? res.status(409).json({ error: 'Slot sudah dibooking' })
        : res.status(404).json({ error: 'Slot tidak ditemukan' });
    } catch (e) { next(e); }
  });
  return r;
};

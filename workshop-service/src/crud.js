const express = require('express');

const checkId = (req, res, next, id) => (/^\d+$/.test(id) ? next() : res.status(400).json({ error: 'ID harus berupa angka' }));

// Pembuat router CRUD generik (GET, POST, PUT, DELETE).
// Nama tabel & kolom berasal dari konstanta kode, bukan input pengguna; nilai selalu lewat parameter ($1, $2, ...).
function crud(pool, table, { fields, required = [], filters = [] }) {
  const r = express.Router();
  r.param('id', checkId);

  r.get('/', async (req, res, next) => {
    try {
      const where = [], values = [];
      for (const f of filters) {
        if (req.query[f] !== undefined) { values.push(req.query[f]); where.push(`${f} = $${values.length}`); }
      }
      const sql = `SELECT * FROM ${table}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
      res.json((await pool.query(sql, values)).rows);
    } catch (e) { next(e); }
  });

  r.get('/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Data tidak ditemukan' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  r.post('/', async (req, res, next) => {
    try {
      const missing = required.filter((f) => req.body[f] === undefined || req.body[f] === '');
      if (missing.length) return res.status(400).json({ error: `Field wajib diisi: ${missing.join(', ')}` });
      const cols = fields.filter((f) => req.body[f] !== undefined);
      const params = cols.map((_, i) => `$${i + 1}`);
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${params.join(', ')}) RETURNING *`,
        cols.map((c) => req.body[c])
      );
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  });

  r.put('/:id', async (req, res, next) => {
    try {
      const cols = fields.filter((f) => req.body[f] !== undefined);
      if (!cols.length) return res.status(400).json({ error: 'Tidak ada field yang diubah' });
      const sets = cols.map((c, i) => `${c} = $${i + 1}`);
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
        [...cols.map((c) => req.body[c]), req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Data tidak ditemukan' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Data tidak ditemukan' });
      res.json({ message: 'Data dihapus', data: rows[0] });
    } catch (e) { next(e); }
  });

  return r;
}

crud.errorHandler = (err, req, res, next) => {
  if (err.code === '23505') return res.status(409).json({ error: 'Data duplikat' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referensi data tidak valid atau data masih dipakai' });
  if (['22P02', '23502', '22007', '22008'].includes(err.code)) return res.status(400).json({ error: 'Format data tidak valid' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Kesalahan server' : err.message });
};

module.exports = crud;

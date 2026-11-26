// Klien HTTP ke Workshop Service (memakai fetch bawaan Node 18+)
const BASE = () => (process.env.WORKSHOP_URL || '').replace(/\/$/, '');

async function call(method, path, body) {
  if (!BASE()) throw Object.assign(new Error('WORKSHOP_URL belum diatur'), { status: 500 });
  let res;
  try {
    res = await fetch(BASE() + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY || '' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw Object.assign(new Error('Workshop Service tidak dapat dihubungi'), { status: 502 });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || `Workshop Service error ${res.status}`), { status: res.status });
  return data;
}

module.exports = {
  getService: (id) => call('GET', `/services/${id}`),          // GET
  getMechanic: (id) => call('GET', `/mechanics/${id}`),        // GET
  getSlot: (id) => call('GET', `/slots/${id}`),                // GET
  reserveSlot: (id) => call('PUT', `/slots/${id}`, { is_booked: true }),   // PUT (atomik, 409 jika terisi)
  releaseSlot: (id) => call('PUT', `/slots/${id}`, { is_booked: false }),  // PUT
};

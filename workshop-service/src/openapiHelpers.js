const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const err = (description) => ({ description, ...json(ref('Error')) });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };

// Bangun schema entitas + schema input dari daftar properti
function entity(props, required = []) {
  return {
    schema: { type: 'object', properties: { id: { type: 'integer' }, ...props } },
    input: { type: 'object', required, properties: props },
  };
}

// Path CRUD standar untuk satu resource
function crudPaths(tag, base, name, filters = []) {
  const q = filters.map((n) => ({ name: n, in: 'query', schema: { type: 'string' } }));
  return {
    [base]: {
      get: { tags: [tag], summary: `Daftar ${tag}`, parameters: q, responses: { 200: { description: 'OK', ...json({ type: 'array', items: ref(name) }) } } },
      post: { tags: [tag], summary: `Tambah ${tag}`, requestBody: { required: true, ...json(ref(`${name}Input`)) }, responses: { 201: { description: 'Dibuat', ...json(ref(name)) }, 400: err('Data tidak valid') } },
    },
    [`${base}/{id}`]: {
      get: { tags: [tag], summary: `Detail ${tag}`, parameters: [idParam], responses: { 200: { description: 'OK', ...json(ref(name)) }, 404: err('Tidak ditemukan') } },
      put: { tags: [tag], summary: `Ubah ${tag}`, parameters: [idParam], requestBody: { required: true, ...json(ref(`${name}Input`)) }, responses: { 200: { description: 'Diubah', ...json(ref(name)) }, 404: err('Tidak ditemukan') } },
      delete: { tags: [tag], summary: `Hapus ${tag}`, parameters: [idParam], responses: { 200: { description: 'Dihapus' }, 404: err('Tidak ditemukan') } },
    },
  };
}

module.exports = { ref, json, err, idParam, entity, crudPaths };

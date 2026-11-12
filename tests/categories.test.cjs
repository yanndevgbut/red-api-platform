const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('../backend/node_modules/express');

const clientId = require.resolve('../backend/config/supabase');
require.cache[clientId] = { id: clientId, filename: clientId, loaded: true, exports: {
  auth: { getUser: async token => ({ data: { user: ['admin', 'user', 'banned'].includes(token) ? { id: token } : null }, error: null }) },
  from: () => ({ select() { return this; }, eq(_key, id) { this.id = id; return this; }, async maybeSingle() { return { data: { role: this.id === 'user' ? 'user' : 'admin', banned: this.id === 'banned' }, error: null }; } }),
} };

test('categories persist, require an active admin and preserve concurrent additions', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'red-api-categories-'));
  process.env.CATEGORIES_FILE = path.join(dir, 'data/categories.json');
  const app = express(); app.use(express.json({ limit: '2kb' })); app.use('/api', require('../backend/routes/categories'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const create = (name, token) => fetch(base + '/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ name }) });
  try {
    assert.deepEqual(await (await fetch(base + '/api/system/categories')).json(), { categories: [] });
    assert.equal((await create('Utilities')).status, 401);
    assert.equal((await create('Utilities', 'invalid')).status, 401);
    assert.equal((await create('Utilities', 'user')).status, 403);
    assert.equal((await create('Utilities', 'banned')).status, 403);
    for (const value of ['ALL', 'all', '', ' '.repeat(3), 'a'.repeat(61), 123]) assert.equal((await create(value, 'admin')).status, 400);
    assert.equal((await create(' Utilities ', 'admin')).status, 201);
    assert.equal((await create('utilities', 'admin')).status, 409);
    const additions = await Promise.all(['Media', 'Social', 'Tools'].map(name => create(name, 'admin')));
    assert.equal(additions.every(response => response.status === 201), true);
    const result = await (await fetch(base + '/api/system/categories')).json();
    assert.deepEqual([...result.categories].sort(), ['Utilities', 'Media', 'Social', 'Tools'].sort());
    assert.deepEqual(JSON.parse(await fs.readFile(process.env.CATEGORIES_FILE, 'utf8')), result.categories);
    await fs.writeFile(process.env.CATEGORIES_FILE, 'invalid json');
    assert.equal((await fetch(base + '/api/system/categories')).status, 503);
    assert.equal((await create('New', 'admin')).status, 503, 'corrupt store must not be overwritten silently');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});

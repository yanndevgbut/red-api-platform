const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('../backend/node_modules/express');
const profiles = { admin: { role: 'admin', banned: false }, member: { role: 'user', banned: false }, banned: { role: 'admin', banned: true } };
let writes = 0;
const id = require.resolve('../backend/config/supabase');
require.cache[id] = { id, filename: id, loaded: true, exports: {
  auth: { getUser: async token => ({ data: { user: profiles[token] ? { id: token, user_metadata: { role: 'admin' } } : null }, error: null }) },
  from(table) {
    return { select() { return this; }, eq(_column, value) { this.target = value; return this; }, order() { return this; }, limit() { return this; },
      update(body) { writes++; this.body = body; return this; },
      async maybeSingle() { return { data: this.body ? { id: this.target, ...this.body } : profiles[this.target], error: null }; },
      then(resolve) { resolve({ data: [], error: null }); },
    };
  },
} };
test('admin API rejects members, forged/revoked credentials, banned admins and mass assignment', async () => {
  const app = express(); app.use(express.json()); app.use('/api/admin', require('../backend/routes/admin'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;
  const req = (token, path = '/users', method = 'GET', body, other = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...other }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await req(null)).status, 401);
    assert.equal((await req(null, '/system', 'GET', null, { 'x-api-key': 'revoked_admin_key' })).status, 401);
    assert.equal((await req('forged')).status, 401);
    assert.equal((await req('member')).status, 403, 'metadata admin claim does not grant admin');
    assert.equal((await req('banned')).status, 403);
    const target = '/users/10000000-0000-0000-0000-000000000001';
    assert.equal((await req('member', target, 'PATCH', { role: 'admin' })).status, 403);
    assert.equal(writes, 0, 'member requests never mutate target accounts');
    assert.equal((await req('admin')).status, 200);
    assert.equal((await req('admin', target, 'PATCH', { limit_remaining: 999999 })).status, 400);
    assert.equal((await req('admin', '/users/1%27%20OR%201=1--', 'PATCH', { role: 'admin' })).status, 400);
    assert.equal((await req('admin', target, 'PATCH', { plan: 'not-a-plan' })).status, 400);
    assert.equal(writes, 0);
    assert.equal((await req('admin', target, 'PATCH', { banned: true })).status, 400, 'confirmation is required before mutation');
    assert.equal((await req('admin', target, 'PATCH', { banned: true }, { 'X-Confirm-Action': 'update-user' })).status, 200);
    assert.equal(writes, 1);
    profiles.admin.banned = true;
    assert.equal((await req('admin')).status, 403, 'ban is checked again on every request');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('rate limiter ignores forged forwarded IPs and preserves health access', async () => {
  const app = express(); app.use(require('../backend/middleware/rate-limit')({ max: 2 })); app.use((_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/admin/test', { headers: { 'X-Forwarded-For': '1.1.1.1' } })).status, 200);
    assert.equal((await fetch(base + '/api/admin/test', { headers: { 'X-Forwarded-For': '2.2.2.2' } })).status, 200);
    const denied = await fetch(base + '/api/admin/test', { headers: { 'X-Forwarded-For': '3.3.3.3' } });
    assert.equal(denied.status, 429); assert.ok(Number(denied.headers.get('Retry-After')) > 0);
    assert.equal((await fetch(base + '/health')).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

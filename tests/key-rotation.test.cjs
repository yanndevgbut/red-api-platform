const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('../backend/node_modules/express');
const rotate = require('../backend/lib/rotate-api-key');
const A = '10000000-0000-0000-0000-000000000001';
const B = '10000000-0000-0000-0000-000000000002';
function fixture() {
  const state = { keys: [
    { id: 'old-1', user_id: A, key: 'old_a_1', is_active: true, created_at: '2025-01-01' },
    { id: 'old-2', user_id: A, key: 'old_a_2', is_active: true, created_at: '2025-01-02' },
    { id: 'other', user_id: B, key: 'other_b', is_active: true, created_at: '2025-01-01' },
  ], writes: 0, fail: false, hold: null, started: null };
  const service = {
    auth: { getUser: async token => ({ data: { user: ['a', 'b', 'banned'].includes(token) ? { id: token === 'b' ? B : A } : null }, error: null }) },
    from(table) {
      const filters = []; const sort = []; let limit = Infinity; let rows;
      const query = {
        select() { return this; }, eq(name, value) { filters.push([name, value]); return this; },
        order(name, opts) { sort.push([name, opts?.ascending !== false]); return this; }, limit(value) { limit = value; return this; },
        upsert(values, options) { assert.equal(options.onConflict, 'id'); rows = values; return this; },
        async maybeSingle() { const result = await execute(); return { ...result, data: result.data?.[0] ?? null }; },
        then(resolve, reject) { return execute().then(resolve, reject); },
      };
      async function execute() {
        if (rows) {
          state.writes++; state.started?.(); if (state.hold) await state.hold;
          if (state.fail) return { data: null, error: { code: '23505' } };
          const updated = state.keys.filter(key => !rows.some(row => row.id === key.id)); state.keys = [...updated, ...rows.map(row => ({ ...row }))];
          return { data: rows, error: null };
        }
        let selected = table === 'profiles' ? [{ id: A, banned: false }, { id: B, banned: true }] : state.keys;
        selected = selected.filter(row => filters.every(([name, value]) => row[name] === value));
        const count = selected.length;
        selected = [...selected].sort((a, b) => { for (const [name, asc] of sort) { if (a[name] !== b[name]) return (a[name] < b[name] ? -1 : 1) * (asc ? 1 : -1); } return 0; }).slice(0, limit);
        return { data: selected, count, error: null };
      }
      return query;
    },
  };
  return { state, service };
}
const missing = { rpc: async () => ({ error: { code: 'PGRST202' } }) };
test('missing RPC fallback replaces all own active keys in one write and preserves other accounts', async () => {
  const { state, service } = fixture();
  const key = await rotate(service, missing, A);
  assert.equal(state.writes, 1); assert.equal(key.user_id, A); assert.match(key.key, /^red_live_[a-f0-9]{48}$/);
  assert.equal(state.keys.filter(row => row.user_id === A && row.is_active).length, 1);
  assert.equal(state.keys.filter(row => row.id.startsWith('old-')).every(row => !row.is_active), true);
  assert.equal(state.keys.find(row => row.user_id === B).is_active, true);
});
test('failed replacement keeps old keys unchanged and authorization errors never fall back', async () => {
  const { state, service } = fixture(); state.fail = true;
  const before = JSON.stringify(state.keys);
  await assert.rejects(rotate(service, missing, A)); assert.equal(JSON.stringify(state.keys), before);
  state.writes = 0;
  await assert.rejects(rotate(service, { rpc: async () => ({ error: { code: '42501' } }) }, A));
  assert.equal(state.writes, 0);
});
test('RPC path is preferred and a user without keys can recover through fallback', async () => {
  const { state, service } = fixture();
  const current = await rotate(service, { rpc: async () => ({ error: null }) }, A);
  assert.equal(state.writes, 0); assert.equal(current.id, 'old-2');
  state.keys = state.keys.filter(row => row.user_id !== A);
  const fresh = await rotate(service, missing, A); assert.equal(fresh.is_active, true);
});
test('rotation route enforces identity/ban and serializes same-account attempts', async () => {
  const { state, service } = fixture();
  for (const [path, exports] of [['../backend/config/supabase', service], ['../backend/lib/user-client', () => missing]]) {
    const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports };
  }
  const app = express(); app.use(express.json()); app.use('/api/user', require('../backend/routes/user'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/user/api-key/rotate`;
  const call = (token, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await call(null)).status, 401); assert.equal((await call('forged')).status, 401);
    assert.equal((await call('b')).status, 403); assert.equal((await call('a', { userId: B })).status, 400); assert.equal(state.writes, 0);
    let release; state.hold = new Promise(resolve => { release = resolve; });
    let started; const ready = new Promise(resolve => { started = resolve; }); state.started = started;
    const first = call('a'); await ready;
    assert.equal((await call('a')).status, 409); assert.equal((await call('a')).status, 409, 'rejected attempt must not unlock another request');
    release(); const response = await first; assert.equal(response.status, 200); assert.equal((await response.json()).apiKey.user_id, A);
    state.hold = null; assert.equal((await call('a')).status, 200);
    assert.equal(state.keys.filter(row => row.user_id === A && row.is_active).length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

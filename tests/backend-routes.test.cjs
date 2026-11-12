const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
// Isolate route registration from production database logging/maintenance checks.
for (const path of ['../backend/middleware/logger', '../backend/middleware/maintenance']) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports: (_req, _res, next) => next() };
}
const app = require('../backend/server');

test('retired endpoints remain removed and TikTok requires valid input and authentication', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/health')).status, 200);
    assert.equal((await fetch(base + '/api/system/stats')).status, 200);
    assert.equal((await (await fetch(base + '/')).json()).endpoints_count, 1);
    assert.equal((await fetch(base + '/api/download/tiktok')).status, 400);
    assert.equal((await fetch(base + '/api/download/tiktok?url=https://example.com')).status, 400);
    assert.equal((await fetch(base + '/api/download/tiktok?url=https://vt.tiktok.com/test')).status, 401);
    for (const [method, path] of [
      ['GET', '/api/ai/chat?prompt=test'], ['POST', '/api/ai/gpt'],
      ['GET', '/api/download/instagram?url=https://www.instagram.com/p/test'],
      ['GET', '/api/stalk/ml?userId=123&zoneId=123'],
      ['GET', '/api/tools/ssweb?url=https://example.com'],
      ['GET', '/api/whatsapp/chinfo?channelUrl=https://whatsapp.com/channel/test'],
    ]) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' }, ...(method === 'POST' ? { body: JSON.stringify({ prompt: 'test' }) } : {}) });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

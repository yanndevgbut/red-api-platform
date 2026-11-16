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
    assert.equal((await (await fetch(base + '/')).json()).endpoints_count, 6);
    assert.equal((await fetch(base + '/api/download/tiktok')).status, 400);
    assert.equal((await fetch(base + '/api/download/tiktok?url=https://example.com')).status, 400);
    assert.equal((await fetch(base + '/api/download/tiktok?url=https://vt.tiktok.com/test')).status, 401);
    assert.equal((await fetch(base+'/api/download/igdl')).status,400);
    assert.equal((await fetch(base+'/api/download/igdl?url=https://www.instagram.com/reel/DfenBL6JaTk/')).status,401);
    assert.equal((await fetch(base+'/api/download/igdl?url=https://instagram.com.evil.test/p/test/')).status,400);
    assert.equal((await fetch(base+'/api/download/igdl?url=https://instagram.com/p/test/&url=https://instagram.com/p/other/')).status,400);
    assert.equal((await fetch(base + '/api/download/ytdl')).status,400);
    assert.equal((await fetch(base + '/api/download/ytdl?url=https://youtu.be/jNQXAC9IVRw')).status,401);
    assert.equal((await fetch(base + '/api/download/ytdl?url=https://youtu.be/jNQXAC9IVRw&quality=-1')).status,400);
    assert.equal((await fetch(base + '/api/download/pindl')).status,400);
    assert.equal((await fetch(base + '/api/download/pindl?url=https://example.com')).status,400);
    assert.equal((await fetch(base + '/api/download/pindl?url=https://www.pinterest.com/pin/123/')).status,401);
    assert.equal((await fetch(base + '/api/download/pindl?url=https://www.pinterest.com/pin/123/&url=https://pin.it/test')).status,400);
    assert.equal((await fetch(base + '/api/stalk/ff')).status, 400);
    assert.equal((await fetch(base + '/api/stalk/ff?uid=12345678')).status, 401);
    assert.equal((await fetch(base + '/api/stalk/ff?uid=12345678&uid=87654321')).status, 400);
    assert.equal((await fetch(base+'/api/tools/ssweb')).status,400);
    assert.equal((await fetch(base+'/api/tools/ssweb?url=http://127.0.0.1')).status,400);
    assert.equal((await fetch(base+'/api/tools/ssweb?url=https://example.com')).status,401);
    assert.equal((await fetch(base+'/api/tools/ssweb?url=https://example.com&mode=wrong')).status,400);
    for (const [method, path] of [
      ['GET', '/api/ai/chat?prompt=test'], ['POST', '/api/ai/gpt'],
      ['GET', '/api/download/instagram?url=https://www.instagram.com/p/test'],
      ['GET', '/api/stalk/ml?userId=123&zoneId=123'],
      ['GET', '/api/whatsapp/chinfo?channelUrl=https://whatsapp.com/channel/test'],
    ]) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' }, ...(method === 'POST' ? { body: JSON.stringify({ prompt: 'test' }) } : {}) });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

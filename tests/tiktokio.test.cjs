const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tiktokio, parseResult, isTikTokUrl } = require('../backend/lib/tiktokio');

const html = '<div class="video-info"><h3>Example &amp; title</h3><img src="https://cdn.example.com/cover.jpg"></div><div class="download-links"><a href="https://dld.tiktokio.com/download?token=test">Download HD</a><a href="javascript:alert(1)">Unsafe</a><a href="https://dld.tiktokio.com/download?token=test">Duplicate</a></div>';
const response = (body, options = {}) => new Response(body, { headers: { 'Content-Type': 'text/html' }, ...options });

test('TikTok URL validation rejects unrelated hosts, credentials and invalid schemes', () => {
  for (const value of ['https://vt.tiktok.com/test', 'https://www.tiktok.com/@user/video/123']) assert.equal(isTikTokUrl(value), true);
  for (const value of ['https://tiktok.com.evil.test/x', 'https://tiktok.com@evil.test/x', 'https://evil@tiktok.com/x', 'http://tiktok.com/x', 'https://localhost/x', 'https://tiktok.com:444/x', ['https://tiktok.com/x'], null]) assert.equal(isTikTokUrl(value), false);
});

test('scraper preserves cookies, request fields and parses safe media links', async () => {
  const calls = [];
  const result = await tiktokio('https://vt.tiktok.com/example', { fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? response('<html>session</html>', { headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'session=test; Path=/; HttpOnly' } }) : response(html);
  } });
  assert.equal(result.title, 'Example & title');
  assert.deepEqual(result.links, [{ type: 'Download HD', link: 'https://dld.tiktokio.com/download?token=test' }]);
  assert.equal(calls[1].init.headers.Cookie, 'session=test');
  assert.deepEqual(JSON.parse(calls[1].init.body), { vid: 'https://vt.tiktok.com/example', prefix: 'tiktokio.com' });
  assert.equal(calls.every(call => call.init.redirect === 'error'), true);
});

test('provider errors, oversized bodies and markup without links cannot return success', async () => {
  assert.throws(() => parseResult('<h3>No media</h3>'), /No downloadable/);
  await assert.rejects(tiktokio('https://vt.tiktok.com/test', { fetchImpl: async () => response('Unavailable', { status: 503 }) }), /Unexpected/);
  await assert.rejects(tiktokio('https://vt.tiktok.com/test', { fetchImpl: async () => response('a'.repeat(2 * 1024 * 1024 + 1)) }), /too large/);
});

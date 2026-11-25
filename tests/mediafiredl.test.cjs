const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, scrape, errorResponse } = require('../backend/lib/mediafiredl');

const key = 'abcdef123456789';
const page = `https://www.mediafire.com/file/${key}/file`;
const direct = `https://download123.mediafire.com/token/${key}/sample.txt`;
const file = (overrides = {}) => Response.json({ response: { result: 'Success', file_info: {
  filename: 'sample.txt', size: '2048', ready: 'yes', privacy: 'public', ...overrides,
} } });
const button = (url) => `<a href="${url}" id='downloadButton'>Download</a>`;

test('mediafiredl normalizes file links, legacy links, CDN links and quickkeys', () => {
  for (const input of [key.toUpperCase(), page, `https://m.mediafire.com/view/${key}/sample.txt`, `https://mediafire.com/?${key}`, `https://mediafire.com/${key}`, direct]) {
    assert.equal(validate(input), key);
  }
  for (const input of [[page], 'x'.repeat(2049), page.replace('https:', 'http:'), page.replace('.com/', '.com.evil.test/'), page.replace('www.', 'user@www.'), page.replace('.com/', '.com:8080/'), 'https://www.mediafire.com/invalid', `https://www.mediafire.com/arbitrary?${key}`]) {
    assert.throws(() => validate(input), { code: 'INVALID_URL' });
  }
  assert.throws(() => validate(`https://mediafire.com/folder/${key}`), { code: 'FOLDER_UNSUPPORTED' });
});

test('mediafiredl returns metadata and direct URL without requesting file bytes', async () => {
  let calls = 0;
  const data = await scrape(key, { fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    if (++calls === 1) {
      assert.equal(new URL(url).searchParams.get('quick_key'), key);
      return file({ hash: 'a'.repeat(64), links: { normal_download: 'https://other.example/' } });
    }
    assert.equal(url, page);
    return new Response(button(direct + '?one=1&amp;two=2'));
  } });
  assert.equal(calls, 2);
  assert.equal(data.filename, 'sample.txt');
  assert.equal(data.size_bytes, 2048);
  assert.equal(data.sha256, 'a'.repeat(64));
  assert.equal(data.download_available, true);
  assert.deepEqual(data.urls, { page, direct: direct + '?one=1&two=2' });
});

test('mediafiredl never exposes protected, foreign or mismatched download links', async () => {
  for (const html of [button(direct) + '<input type="password">', button('https://other.example/file'), button(direct.replace(key, 'abcdeffedcba123')), button(direct.replace('.com/', '.com:8080/'))]) {
    const result = await scrape(key, { fetchImpl: async (url) => url === page ? new Response(html) : file() });
    assert.equal(result.urls.direct, null);
    assert.equal(result.download_available, false);
  }
  const result = await scrape(key, { fetchImpl: async (url) => {
    assert.notEqual(url, page);
    return file({ password_protected: 'yes', size: null });
  } });
  assert.equal(result.password_protected, true);
  assert.equal(result.size_bytes, null);
});

test('mediafiredl rejects redirects outside MediaFire and cancels oversized streams', async () => {
  let calls = 0;
  await assert.rejects(scrape(key, { fetchImpl: async () => {
    calls++;
    return new Response(null, { status: 302, headers: { Location: 'https://outside.example/' } });
  } }), { code: 'MEDIAFIRE_RESPONSE' });
  assert.equal(calls, 1);
  let canceled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(512 * 1024 + 1)); }, cancel() { canceled = true; } });
  await assert.rejects(scrape(key, { fetchImpl: async () => new Response(body) }), { code: 'MEDIAFIRE_RESPONSE' });
  assert.equal(canceled, true);
});

test('mediafiredl handles missing, removed, malformed and timed-out responses', async () => {
  await assert.rejects(scrape(key, { fetchImpl: async () => Response.json({ response: { result: 'Error', error: 110 } }) }), { code: 'FILE_NOT_FOUND' });
  await assert.rejects(scrape(key, { fetchImpl: async (url) => url === page ? new Response('This file is no longer available') : file() }), { code: 'FILE_REMOVED' });
  await assert.rejects(scrape(key, { fetchImpl: async () => new Response('<html>') }), { code: 'MEDIAFIRE_RESPONSE' });
  await assert.rejects(scrape(key, { signal: AbortSignal.abort(), fetchImpl: async () => assert.fail('request after abort') }), (error) => errorResponse(error).status === 504);
});

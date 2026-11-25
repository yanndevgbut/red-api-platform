const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { parseInput, getPastebin, errorResponse } = require('../backend/lib/getpastebin');

const id = 'AbCd1234';
const page = `https://pastebin.com/${id}`;
const raw = `https://pastebin.com/raw/${id}`;
const plain = (body, init = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }, ...init });

test('getpastebin accepts only HTTPS pastebin URLs with an 8 character ID', () => {
  assert.deepEqual(parseInput(page), { id, page, raw });
  assert.deepEqual(parseInput(`https://www.pastebin.com/raw/${id}/`), { id, page, raw });
  for (const input of [
    `http://pastebin.com/${id}`,
    `https://pastebin.com.evil.test/${id}`,
    `https://user@pastebin.com/${id}`,
    `https://pastebin.com:8443/${id}`,
    'https://pastebin.com/abc1234',
    'https://pastebin.com/abc123456',
    'https://pastebin.com/',
    'abcdefgh',
    ['https://pastebin.com/' + id],
    'https://pastebin.com/' + 'a'.repeat(2049),
  ]) {
    assert.throws(() => parseInput(input), { code: 'invalid_url' });
  }
});

test('getpastebin returns text, byte count and SHA-256 without extra requests', async () => {
  const body = 'hello paste\nsecond line\n';
  let calls = 0;
  const data = await getPastebin(parseInput(page), {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, raw);
      assert.equal(options.redirect, 'manual');
      assert.ok(options.signal);
      return plain(body);
    },
  });
  assert.equal(calls, 1);
  assert.equal(data.content, body);
  assert.equal(data.bytes, Buffer.byteLength(body));
  assert.equal(data.sha256, createHash('sha256').update(body).digest('hex'));
  assert.deepEqual(data.urls, { page, raw });
  assert.equal(data.id, id);
});

test('getpastebin follows only Pastebin redirects and rejects foreign ones', async () => {
  const seen = [];
  const data = await getPastebin(parseInput(page), {
    fetchImpl: async (url) => {
      seen.push(url);
      if (seen.length === 1) return new Response(null, { status: 302, headers: { location: `https://www.pastebin.com/raw/${id}` } });
      return plain('ok');
    },
  });
  assert.equal(data.content, 'ok');
  assert.deepEqual(seen, [raw, `https://www.pastebin.com/raw/${id}`]);
  await assert.rejects(getPastebin(parseInput(page), {
    fetchImpl: async () => new Response(null, { status: 301, headers: { location: 'https://outside.example/raw' } }),
  }), { code: 'upstream_error' });
});

test('getpastebin separates not found, blocked, non-text and oversized responses', async () => {
  await assert.rejects(getPastebin(parseInput(page), { fetchImpl: async () => new Response(null, { status: 404 }) }), { code: 'not_found' });
  await assert.rejects(getPastebin(parseInput(page), { fetchImpl: async () => new Response(null, { status: 403 }) }), { code: 'blocked' });
  await assert.rejects(getPastebin(parseInput(page), { fetchImpl: async () => new Response(null, { status: 200, headers: { 'cf-mitigated': 'challenge' } }) }), { code: 'blocked' });
  await assert.rejects(getPastebin(parseInput(page), {
    fetchImpl: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
  }), { code: 'non_text' });
  await assert.rejects(getPastebin(parseInput(page), {
    fetchImpl: async () => new Response(Buffer.from([104, 105, 0, 0])),
  }), { code: 'non_text' });
  await assert.rejects(getPastebin(parseInput(page), {
    fetchImpl: async () => new Response('x', { headers: { 'content-type': 'text/plain', 'content-length': String(2 * 1024 * 1024 + 1) } }),
  }), { code: 'too_large' });
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
    cancel() { canceled = true; },
  });
  await assert.rejects(getPastebin(parseInput(page), { fetchImpl: async () => new Response(stream, { headers: { 'content-type': 'text/plain' } }) }), { code: 'too_large' });
  assert.equal(canceled, true);
});

test('getpastebin retries upstream failures and maps timeouts to 504', async () => {
  let calls = 0;
  const data = await getPastebin(parseInput(page), {
    fetchImpl: async () => (++calls === 1 ? new Response(null, { status: 503 }) : plain('recovered')),
  });
  assert.equal(calls, 2);
  assert.equal(data.content, 'recovered');
  assert.equal(errorResponse(new DOMException('Timeout', 'TimeoutError')).status, 504);
  assert.equal(errorResponse(new Error('boom')).status, 502);
  await assert.rejects(getPastebin(parseInput(page), {
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  }), (error) => errorResponse(error).status === 504);
});

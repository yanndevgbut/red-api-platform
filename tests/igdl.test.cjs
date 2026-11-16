const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeInput,
  mediaURL,
  parseResult,
  scrapeInstagram,
  errorResponse,
} = require('../backend/lib/igdl');
const source = 'https://www.instagram.com/reel/DfenBL6JaTk/';
const normalized = normalizeInput(source);
const option = (ext, url = `https://cdn.example.com/media.${ext}`) => ({
  ext,
  url,
  label: 'Download',
  size: '1024',
});
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
test('Instagram URL normalization accepts posts/Reels/TV and strips tracking, but rejects spoofing and ambiguous parameters', () => {
  for (const kind of ['p', 'reel', 'reels', 'tv']) {
    const result = normalizeInput(
      `https://instagram.com/${kind}/ABcd_-123/?igsh=tracking#fragment`,
    );
    assert.equal(result.shortcode, 'ABcd_-123');
    assert.equal(
      result.source,
      `https://www.instagram.com/${kind === 'reels' ? 'reel' : kind}/ABcd_-123/`,
    );
  }
  for (const input of [
    null,
    [],
    [source],
    '',
    'http://instagram.com/p/test/',
    'https://instagram.com.evil.test/reel/test/',
    'https://user:pass@instagram.com/p/test/',
    'https://instagram.com:444/p/test/',
    'https://127.0.0.1/p/test/',
    'https://www.instagram.com/someuser/',
    'https://www.instagram.com/stories/name/123/',
    'https://www.instagram.com/p/a/extra',
    'https://www.instagram.com/p/' + 'a'.repeat(129),
  ])
    assert.throws(() => normalizeInput(input), { code: 'INVALID_URL' });
});
test('request is fixed to TapDL and returns MP4/MP3 with the reference JSON contract', async () => {
  let calls = 0;
  const result = await scrapeInstagram(source + '?tracking=removed', {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://www.tapdl.com/wp-json/svd/v1/fetch');
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), {
        url: source,
        lang: 'en',
        tool: 'instagram',
      });
      assert.equal(options.headers.Origin, 'https://www.tapdl.com');
      assert.equal(options.headers['x-api-key'], undefined);
      return response({
        platform: 'Instagram',
        items: [
          {
            title: 'Test',
            uploader: 'public_user',
            duration: '12.5',
            downloads: [option('MP4'), option('mp3')],
          },
        ],
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.provider, 'tapdl.com');
  assert.equal(result.source, source);
  assert.equal(result.items[0].downloads.mp4.length, 1);
  assert.equal(result.items[0].downloads.mp3.length, 1);
  assert.equal(result.items[0].duration_seconds, 12.5);
  assert.equal(result.items[0].downloads.mp4[0].size_bytes, 1024);
});
test('photo-only, audio-only and video-only posts and mixed carousels remain supported', () => {
  for (const format of [
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif',
    'avif',
    'heic',
    'heif',
    'mp4',
    'mp3',
  ]) {
    const result = parseResult(
      { items: [{ downloads: [option(format)] }] },
      normalized,
    );
    assert.equal(Object.values(result.items[0].downloads).flat().length, 1);
  }
  const data = parseResult(
    {
      items: [
        null,
        { title: 'Photo', downloads: [option('jpg')] },
        { title: 'Video', downloads: [option('mp4')] },
      ],
    },
    normalized,
  );
  assert.equal(data.items.length, 2);
  const item = parseResult(
    {
      items: [
        {
          duration: 'Infinity',
          downloads: [{ ...option('jpg'), size: 'Infinity' }],
        },
      ],
    },
    normalized,
  ).items[0];
  assert.equal(item.duration_seconds, null);
  assert.equal(item.downloads.image[0].size_bytes, null);
});
test('malformed/unsafe download URLs and unsupported formats do not become successful media', () => {
  for (const url of [
    'javascript:alert(1)',
    'http://cdn.example.com/a.mp4',
    'https://user:pass@cdn.example.com/a.mp4',
    'https://127.0.0.1/a.mp4',
    'https://[::1]/a.mp4',
    'https://local.internal/a.mp4',
    'https://cdn.example.com:8443/a.mp4',
    '/relative.mp4',
  ])
    assert.equal(mediaURL(url), null, url);
  assert.throws(() => parseResult({ items: [] }, normalized), {
    code: 'MEDIA_NOT_FOUND',
  });
  assert.throws(
    () => parseResult({ items: [{ downloads: [option('zip')] }] }, normalized),
    { code: 'FORMAT_UNAVAILABLE' },
  );
  assert.throws(
    () =>
      parseResult(
        { items: [{ downloads: [option('mp4', 'https://127.0.0.1/a.mp4')] }] },
        normalized,
      ),
    { code: 'FORMAT_UNAVAILABLE' },
  );
  assert.throws(
    () => parseResult({ items: new Array(101).fill({}) }, normalized),
    { code: 'INVALID_RESPONSE' },
  );
});
test('rate limits, non-JSON, provider failures, malformed/oversized bodies and cancellation fail explicitly', async () => {
  await assert.rejects(
    () =>
      scrapeInstagram(source, {
        fetchImpl: async () => new Response('captcha', { status: 429 }),
      }),
    { code: 'RATE_LIMITED' },
  );
  await assert.rejects(
    () =>
      scrapeInstagram(source, {
        fetchImpl: async () =>
          new Response('<html>error</html>', {
            headers: { 'content-type': 'text/html' },
          }),
      }),
    { code: 'NON_JSON_RESPONSE' },
  );
  await assert.rejects(
    () =>
      scrapeInstagram(source, {
        fetchImpl: async () =>
          response({
            success: false,
            code: 'private_post',
            message: 'Private post',
          }),
      }),
    { code: 'private_post' },
  );
  await assert.rejects(
    () =>
      scrapeInstagram(source, {
        fetchImpl: async () =>
          response({ error: { message: 'Unavailable' } }, 404),
      }),
    { code: 'HTTP_404' },
  );
  await assert.rejects(
    () => scrapeInstagram(source, { fetchImpl: async () => response(null) }),
    { code: 'INVALID_RESPONSE' },
  );
  await assert.rejects(
    () =>
      scrapeInstagram(source, {
        fetchImpl: async () =>
          new Response('{', {
            headers: { 'content-type': 'application/json' },
          }),
      }),
    { code: 'INVALID_RESPONSE' },
  );
  await assert.rejects(
    () =>
      scrapeInstagram(source, {
        fetchImpl: async () =>
          new Response('x'.repeat(2 * 1024 * 1024 + 1), {
            headers: { 'content-type': 'application/json' },
          }),
      }),
    { code: 'INVALID_RESPONSE' },
  );
  const signal = AbortSignal.abort(new DOMException('cancelled', 'AbortError'));
  await assert.rejects(
    () =>
      scrapeInstagram(source, {
        signal,
        fetchImpl: async (_u, options) => options.signal.throwIfAborted(),
      }),
    { name: 'AbortError' },
  );
  assert.equal(
    errorResponse({ code: 'RATE_LIMITED', message: 'Later' }).status,
    429,
  );
  assert.equal(
    errorResponse({ code: 'MEDIA_NOT_FOUND', message: 'Missing' }).status,
    404,
  );
  assert.equal(errorResponse({ name: 'TimeoutError' }).status, 504);
});

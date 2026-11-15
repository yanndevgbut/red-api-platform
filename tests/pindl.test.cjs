const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  scrapePinterest,
  parsePinterest,
  isPinterestUrl,
} = require('../backend/lib/pindl');
const page = 'https://www.pinterest.com/pin/123456/';
const image =
  '<meta property="og:title" content="A &amp; B"><meta content="https://i.pinimg.com/originals/photo.jpg" property="og:image">';
const htmlResponse = (html) =>
  new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
test('Pinterest input validation rejects non-pin URLs, credentials, ports and spoofed domains', () => {
  for (const input of [
    page,
    'https://pinterest.com/pin/123/',
    'https://id.pinterest.com/pin/123/',
    'https://pin.it/abc',
  ])
    assert.equal(isPinterestUrl(input), true);
  for (const input of [
    null,
    [],
    ['https://pin.it/abc'],
    '',
    'http://pin.it/a',
    'https://user:pass@pin.it/abc',
    'https://pin.it:8443/abc',
    'https://pinterest.com.evil.test/pin/123/',
    'https://evilpinterest.com/pin/123/',
    'https://127.0.0.1/pin/123/',
    'https://pinterest.com/search/',
    'https://pinterest.com/pin/123abc/',
    'https://pin.it/',
    'file:///etc/passwd',
  ])
    assert.equal(isPinterestUrl(input), false, String(input));
});
test('public image metadata is decoded, HTTPS pinimg-only and keeps the pin ID', () => {
  assert.deepEqual(parsePinterest(image, page), {
    id: '123456',
    title: 'A & B',
    type: 'image',
    format: 'jpg',
    url: 'https://i.pinimg.com/originals/photo.jpg',
    source: page,
  });
  for (const url of [
    'https://evil.test/a.jpg',
    'http://i.pinimg.com/a.jpg',
    'https://pinimg.com.evil.test/a.jpg',
    'https://user:pass@i.pinimg.com/a.jpg',
    'https://i.pinimg.com:8443/a.jpg',
    'javascript:alert(1)',
    'https://i.pinimg.com/a.html',
  ])
    assert.throws(() =>
      parsePinterest(`<meta property="og:image" content="${url}">`, page),
    );
  assert.throws(
    () => parsePinterest('<title>Login</title>', page),
    /Media publik/,
  );
});
test('video extraction prefers MP4 then resolution and ignores other pins and unsafe candidates', () => {
  const data = {
    pins: [
      {
        id: '999',
        videos: {
          url: 'https://v.pinimg.com/unrelated.mp4',
          width: 9999,
          height: 9999,
        },
      },
      {
        id: '123456',
        videos: [
          { url: 'https://v.pinimg.com/hls.m3u8', width: 4000, height: 4000 },
          { url: 'https://v.pinimg.com/low.mp4', width: 640, height: 480 },
          {
            url: 'https://v.pinimg.com/high.mp4?x=1',
            width: 1920,
            height: 1080,
          },
          { url: 'https://evil.test/a.mp4', width: 9999, height: 9999 },
        ],
      },
    ],
  };
  const result = parsePinterest(
    image +
      `<script id="__PWS_DATA__" type="application/json">${JSON.stringify(data)}</script>`,
    page,
  );
  assert.equal(result.type, 'video');
  assert.equal(result.format, 'mp4');
  assert.equal(result.url, 'https://v.pinimg.com/high.mp4?x=1');
  assert.throws(
    () =>
      parsePinterest(
        image + '<meta property="og:type" content="video.other">',
        page,
      ),
    /URL video/,
    'a video must not silently become its thumbnail',
  );
  const ld =
    '<script type="application/ld+json">{"@type":"VideoObject","contentUrl":"https://v.pinimg.com/ld.mp4"}</script>';
  assert.equal(
    parsePinterest(image + ld, page).url,
    'https://v.pinimg.com/ld.mp4',
  );
  const unrelated =
    '<script type="application/ld+json">{"@type":"VideoObject","url":"https://pinterest.com/pin/999/","contentUrl":"https://v.pinimg.com/other.mp4"}</script>';
  assert.equal(parsePinterest(image + unrelated, page).type, 'image');
  assert.equal(
    parsePinterest(
      image + '<script type="application/json">broken</script>',
      page,
    ).type,
    'image',
  );
});
test('pin.it follows only validated redirects and shares one deadline', async () => {
  const visited = [];
  let signal;
  const result = await scrapePinterest('https://pin.it/abc', {
    fetchImpl: async (url, options) => {
      visited.push(String(url));
      assert.equal(options.redirect, 'manual');
      assert.ok(options.headers['User-Agent'].includes('Chrome/131'));
      if (signal) assert.equal(options.signal, signal);
      signal = options.signal;
      return visited.length === 1
        ? new Response(null, { status: 302, headers: { Location: page } })
        : htmlResponse(image);
    },
  });
  assert.equal(result.id, '123456');
  assert.equal(visited.length, 2);
  let calls = 0;
  await assert.rejects(
    () =>
      scrapePinterest('https://pin.it/abc', {
        fetchImpl: async () => {
          calls++;
          return new Response(null, {
            status: 302,
            headers: { Location: 'http://127.0.0.1/' },
          });
        },
      }),
    /URL/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    () =>
      scrapePinterest('https://pin.it/abc', {
        fetchImpl: async () => {
          calls++;
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://pin.it/abc' },
          });
        },
      }),
    /Terlalu banyak redirect/,
  );
  assert.equal(calls, 9);
  await assert.rejects(
    () =>
      scrapePinterest(page, {
        fetchImpl: async () => new Response(null, { status: 302 }),
      }),
    /Redirect tanpa/,
  );
});
test('upstream errors, non-HTML, oversized bodies and cancellation fail explicitly', async () => {
  await assert.rejects(
    () =>
      scrapePinterest(page, {
        fetchImpl: async () => new Response('gone', { status: 404 }),
      }),
    { name: 'PinNotFoundError' },
  );
  await assert.rejects(
    () =>
      scrapePinterest(page, {
        fetchImpl: async () => new Response('Forbidden', { status: 403 }),
      }),
    /HTTP 403/,
  );
  await assert.rejects(
    () =>
      scrapePinterest(page, {
        fetchImpl: async () =>
          new Response('{}', {
            headers: { 'content-type': 'application/json' },
          }),
      }),
    /bukan HTML/,
  );
  await assert.rejects(
    () =>
      scrapePinterest(page, {
        fetchImpl: async () => htmlResponse('x'.repeat(5 * 1024 * 1024 + 1)),
      }),
    /terlalu besar/,
  );
  const signal = AbortSignal.abort(new DOMException('timeout', 'TimeoutError'));
  await assert.rejects(
    () =>
      scrapePinterest(page, {
        signal,
        fetchImpl: async (_url, options) => {
          options.signal.throwIfAborted();
        },
      }),
    { name: 'TimeoutError' },
  );
});

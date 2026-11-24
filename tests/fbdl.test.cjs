const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, scrape, errorResponse } = require('../backend/lib/fbdl');
const id = '10153231379946729';
const video = 'https://www.facebook.com/watch/?v=' + id;
const hd = 'https://video.example.fbcdn.net/hd.mp4';
const sd = 'https://video.example.fbcdn.net/sd.mp4';

test('fbdl validates scalar Facebook URLs and every redirect destination', async () => {
  for (const value of [
    [video],
    'http://fb.watch/x',
    'https://www.facebook.com.evil.test/x',
    'https://127.0.0.1/',
    'https://user@facebook.com/x',
    'https://facebook.com:8080/x',
  ]) {
    assert.throws(() => validate(value), { code: 'INVALID_URL' });
  }
  await assert.rejects(
    scrape('https://fb.watch/abc/', {
      fetchImpl: async (url, options) => {
        assert.ok(
          ['fb.watch', 'www.facebook.com'].includes(new URL(url).hostname),
        );
        assert.equal(options.redirect, 'manual');
        return new Response(null, {
          status: 302,
          headers: { location: 'https://127.0.0.1/' },
        });
      },
    }),
    { code: 'FACEBOOK_RESPONSE' },
  );
});

test('fbdl preserves public HD and SD links and reads metadata for the matching video', async () => {
  const html =
    '<script>' +
    JSON.stringify({
      hd_src: hd,
      sd_src: sd,
      playable_url: 'https://outside.example/video',
    }) +
    '</script>';
  const detail =
    '<meta property="og:title" content="Public &amp; video"><script type="application/json">' +
    JSON.stringify({
      data: {
        id,
        owner: { id: '123', name: 'Creator' },
        playable_duration_in_ms: 12000,
      },
    }) +
    '</script>';
  const result = await scrape(video, {
    fetchImpl: async (url) =>
      new Response(url.includes('/video/embed') ? html : detail),
  });
  assert.equal(result.title, 'Public & video');
  assert.equal(result.metadata.duration_seconds, 12);
  assert.deepEqual(result.media, [
    { type: 'video', quality: 'HD', url: hd },
    { type: 'video', quality: 'SD', url: sd },
  ]);
});

test('fbdl extracts only the matching public photo and rejects unavailable media', async () => {
  const photo = 'https://www.facebook.com/photo.php?fbid=123';
  const image = 'https://scontent.example.fbcdn.net/p.jpg';
  const matching =
    '<script type="application/json">' +
    JSON.stringify([
      {
        id: '456',
        image: { uri: 'https://scontent.example.fbcdn.net/other.jpg' },
      },
      { id: '123', image: { uri: image, width: 800, height: 600 } },
    ]) +
    '</script>';
  const result = await scrape(photo, {
    fetchImpl: async () => new Response(matching),
  });
  assert.equal(result.type, 'photo');
  assert.deepEqual(result.media, [
    { type: 'image', quality: 'source', url: image, width: 800, height: 600 },
  ]);
  await assert.rejects(
    scrape(video, {
      fetchImpl: async () => new Response(null, { status: 403 }),
    }),
    { code: 'FACEBOOK_RESTRICTED' },
  );
  await assert.rejects(
    scrape(video, {
      fetchImpl: async () => new Response(null, { status: 429 }),
    }),
    { code: 'RATE_LIMITED' },
  );
  assert.equal(
    errorResponse(new DOMException('Timeout', 'TimeoutError')).status,
    504,
  );
});

test('fbdl tries the public embed after a share URL reveals the Reel ID', async () => {
  const share = 'https://www.facebook.com/share/r/example/';
  const reel = 'https://www.facebook.com/reel/' + id;
  const urls = [];
  const result = await scrape(share, {
    fetchImpl: async (value) => {
      urls.push(value);
      const url = new URL(value);
      if (url.pathname.startsWith('/share/')) {
        return new Response(null, {
          status: 302,
          headers: { location: reel + '?rdid=tracking' },
        });
      }
      if (url.pathname === '/video/embed') {
        assert.equal(url.searchParams.get('video_id'), id);
        return new Response(
          '<script>' + JSON.stringify({ hd_src: hd }) + '</script>',
        );
      }
      assert.equal(value, reel);
      return new Response('<html></html>');
    },
  });
  assert.equal(result.type, 'reel');
  assert.equal(result.resolved_url, reel);
  assert.equal(result.metadata.id, id);
  assert.equal(result.media[0].url, hd);
  assert.equal(urls.length, 3);
});

test('fbdl reports a rejected share link separately from unavailable media', async () => {
  await assert.rejects(
    scrape('https://www.facebook.com/share/r/example/', {
      fetchImpl: async () => new Response('Error', { status: 400 }),
    }),
    (error) =>
      error.code === 'SHARE_URL_UNRESOLVED' &&
      errorResponse(error).status === 422,
  );
});

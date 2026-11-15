const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('../backend/node_modules/express');
const {
  scrapeYouTube,
  videoId,
  validateQuality,
} = require('../backend/lib/ytdl');
const {
  readInput,
  conversionSlots,
  createHandler,
} = require('../backend/lib/ytdl-response');
const id = 'jNQXAC9IVRw',
  url = `https://youtu.be/${id}`;
const jobs = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
];
const metadata = {
  id,
  title: 'Test',
  author: 'Tester',
  duration: 19,
  video: [
    { format: 'WEBM', quality: 2160 },
    { format: 'MP4', quality: 1080, label: '1080p' },
    { format: 'MP4', quality: 720, label: '720p' },
    { format: 'MP4', quality: 240, label: '240p' },
  ],
  audio: [
    { format: 'M4A', quality: 'm4a' },
    { format: 'MP3', quality: 'mp3', label: '192 kbps' },
  ],
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
function provider({
  info = metadata,
  error,
  jobSwap = false,
  invalidId = false,
} = {}) {
  let count = 0;
  const calls = [];
  return {
    calls,
    fetchImpl: async (target, options) => {
      calls.push({
        target,
        options,
        body: options.body ? JSON.parse(options.body) : undefined,
      });
      assert.equal(new URL(target).origin, 'https://tubdown.com');
      assert.equal(options.redirect, 'error');
      if (target.endsWith('/api/info')) return json({ info });
      if (error) return json({ error });
      if (options.method === 'POST') {
        const job = jobs[count++];
        return json({
          job: { id: invalidId ? '../../admin' : job, status: 'processing' },
        });
      }
      const job = target.split('/').at(-1);
      return json({
        job: {
          id: jobSwap ? jobs[1] : job,
          status: 'ready',
          size: 100,
          fileName: 'Test.mp4',
        },
      });
    },
  };
}
test('YouTube validation accepts canonical variants and rejects spoofing/ambiguous input before provider calls', () => {
  for (const value of [
    url,
    `https://www.youtube.com/watch?v=${id}`,
    `https://m.youtube.com/shorts/${id}`,
    `https://youtube.com/embed/${id}`,
    `https://youtube.com/live/${id}`,
  ])
    assert.equal(videoId(value), id);
  for (const value of [
    null,
    [],
    [url],
    'http://youtu.be/' + id,
    'https://user:pass@youtu.be/' + id,
    'https://youtu.be:8443/' + id,
    'https://youtube.com.evil.test/watch?v=' + id,
    'https://127.0.0.1/watch?v=' + id,
    'https://youtube.com/watch?v=' + id + '&v=aaaaaaaaaaa',
    'https://youtu.be/short',
    'https://youtube.com/playlist?list=abc',
  ])
    assert.throws(() => videoId(value), { code: 'INVALID_URL' });
  for (const value of [0, -1, 1.5, NaN, Infinity, 4321, '720'])
    assert.throws(() => validateQuality(value), { code: 'INVALID_QUALITY' });
  assert.equal(readInput({ url, quality: '' }).quality, 720);
  assert.equal(readInput({ url, quality: '1080' }).quality, 1080);
  for (const value of [[], ['720'], '7e2', '-1', '1.5', '00000'])
    assert.throws(() => readInput({ url, quality: value }), {
      code: 'INVALID_QUALITY',
    });
});
test('converts MP4 then MP3, selects requested maximum, validates job IDs and constructs fixed-origin links', async () => {
  const fixture = provider();
  const sleeps = [];
  const result = await scrapeYouTube(url, {
    fetchImpl: fixture.fetchImpl,
    delayImpl: async (ms, _v, { signal }) => {
      assert.equal(signal.aborted, false);
      sleeps.push(ms);
    },
  });
  assert.equal(result.id, id);
  assert.equal(result.downloads.mp4.quality, '720p');
  assert.equal(result.downloads.mp3.format, 'mp3');
  assert.equal(
    result.downloads.mp4.url,
    `https://tubdown.com/api/jobs/${jobs[0]}/file`,
  );
  assert.deepEqual(sleeps, [2000, 2000]);
  assert.deepEqual(
    fixture.calls
      .filter((c) => c.target.endsWith('/api/jobs'))
      .map((c) => c.body),
    [
      { id, type: 'video', quality: 720 },
      { id, type: 'audio', quality: 'mp3' },
    ],
  );
  const below = provider();
  const lower = await scrapeYouTube(url, {
    quality: 144,
    fetchImpl: below.fetchImpl,
    delayImpl: async () => {},
  });
  assert.equal(lower.downloads.mp4.quality, '240p');
});
test('provider errors and malformed responses cannot become successful downloads', async () => {
  for (const fixture of [
    provider({ jobSwap: true }),
    provider({ invalidId: true }),
  ])
    await assert.rejects(
      () =>
        scrapeYouTube(url, {
          fetchImpl: fixture.fetchImpl,
          delayImpl: async () => {},
        }),
      { code: 'INVALID_JOB' },
    );
  await assert.rejects(
    () =>
      scrapeYouTube(url, {
        fetchImpl: provider({ info: { ...metadata, id: 'different' } })
          .fetchImpl,
      }),
    { code: 'INVALID_RESPONSE' },
  );
  await assert.rejects(
    () =>
      scrapeYouTube(url, {
        fetchImpl: provider({ info: { ...metadata, audio: [] } }).fetchImpl,
      }),
    { code: 'FORMAT_UNAVAILABLE' },
  );
  await assert.rejects(
    () => scrapeYouTube(url, { fetchImpl: async () => json({}, 429) }),
    { code: 'RATE_LIMITED' },
  );
  await assert.rejects(
    () =>
      scrapeYouTube(url, {
        fetchImpl: async () =>
          new Response('<html>error</html>', {
            headers: { 'content-type': 'text/html' },
          }),
      }),
    { code: 'NON_JSON_RESPONSE' },
  );
  await assert.rejects(
    () =>
      scrapeYouTube(url, {
        fetchImpl: async () =>
          new Response('x'.repeat(1024 * 1024 + 1), {
            headers: { 'content-type': 'application/json' },
          }),
      }),
    { code: 'INVALID_RESPONSE' },
  );
  await assert.rejects(
    () =>
      scrapeYouTube(url, {
        fetchImpl: provider({
          error: { code: 'VIDEO_UNAVAILABLE', message: 'Unavailable' },
        }).fetchImpl,
      }),
    { code: 'VIDEO_UNAVAILABLE' },
  );
  const signal = AbortSignal.abort(new DOMException('stopped', 'AbortError'));
  await assert.rejects(
    () =>
      scrapeYouTube(url, {
        signal,
        fetchImpl: async (_u, o) => o.signal.throwIfAborted(),
      }),
    { name: 'AbortError' },
  );
});
test('heartbeat keeps valid JSON, preserves provider errors and releases conversion slots on disconnect', async () => {
  let finish, observedAbort;
  const aborted = new Promise((r) => (observedAbort = r));
  let mode = 'pending';
  const app = express();
  app.get(
    '/',
    (req, res, next) => {
      req.ytdlInput = { url, quality: 720 };
      next();
    },
    conversionSlots(1),
    createHandler({
      heartbeatMs: 5,
      scrape: (_input, { signal }) =>
        mode === 'quick'
          ? Promise.resolve({ ok: true })
          : new Promise((resolve, reject) => {
              finish = resolve;
              signal.addEventListener(
                'abort',
                () => {
                  observedAbort();
                  reject(signal.reason);
                },
                { once: true },
              );
              if (mode === 'error')
                setTimeout(
                  () =>
                    reject(
                      Object.assign(new Error('Rate limited'), {
                        code: 'RATE_LIMITED',
                      }),
                    ),
                  25,
                );
            }),
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(base);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    const body = response.text();
    assert.equal((await fetch(base)).status, 503);
    finish({ ok: true });
    assert.deepEqual(JSON.parse(await body), {
      success: true,
      data: { ok: true },
    });
    mode = 'error';
    response = await fetch(base);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).error.code, 'RATE_LIMITED');
    mode = 'pending';
    const controller = new AbortController();
    response = await fetch(base, { signal: controller.signal });
    controller.abort();
    await response.body.cancel().catch(() => {});
    await aborted;
    mode = 'quick';
    response = await fetch(base);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test('early provider rejection retains HTTP error status before any heartbeat', async () => {
  const app = express();
  app.get(
    '/',
    (req, res, next) => {
      req.ytdlInput = { url, quality: 720 };
      next();
    },
    createHandler({
      scrape: async () => {
        throw Object.assign(new Error('Try later'), { code: 'RATE_LIMITED' });
      },
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
    assert.equal((await response.json()).success, false);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

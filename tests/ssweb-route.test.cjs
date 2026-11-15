const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('../backend/node_modules/express');
let holdProfile = false,
  profileStarted,
  finishProfile,
  clientClosed;
let charges = 0,
  runtimeReady = true,
  databaseError = false,
  hold = false,
  started,
  finish,
  aborted;
const actual = require('../backend/lib/ssweb');
const runtime = require('../backend/lib/ssweb-runtime');
const runtimePath = require.resolve('../backend/lib/ssweb-runtime');
require.cache[runtimePath].exports = {
  ...runtime,
  available: () => runtimeReady,
  ready: () => runtimeReady,
};
const screenshotPath = require.resolve('../backend/lib/ssweb');
require.cache[screenshotPath].exports = {
  ...actual,
  screenshotWeb: async (_url, _options, { signal }) => {
    if (!hold)
      return {
        mode: 'desktop',
        image: { mime_type: 'image/png', base64: 'test' },
      };
    return new Promise((resolve, reject) => {
      finish = resolve;
      started?.();
      signal.addEventListener(
        'abort',
        () => {
          aborted?.();
          reject(signal.reason);
        },
        { once: true },
      );
    });
  },
};
const egressPath = require.resolve('../backend/lib/ssweb-egress');
const egress = require(egressPath);
require.cache[egressPath].exports = {
  ...egress,
  resolvePublic: async (host) => {
    if (host === 'private.example.com')
      throw Object.assign(new Error('blocked'), { code: 'BLOCKED_TARGET' });
    return { address: '1.1.1.1', family: 4 };
  },
};
const clientPath = require.resolve('../backend/config/supabase');
require.cache[clientPath] = {
  id: clientPath,
  filename: clientPath,
  loaded: true,
  exports: {
    from(table) {
      return {
        filters: {},
        select() {
          return this;
        },
        eq(key, value) {
          this.filters[key] = value;
          return this;
        },
        async maybeSingle() {
          if (databaseError) return { error: {} };
          if (table === 'api_keys')
            return {
              data: ['valid-key', 'banned-key'].includes(this.filters.key)
                ? {
                    user_id:
                      this.filters.key === 'banned-key' ? 'banned' : 'member',
                  }
                : null,
            };
          if (holdProfile)
            await new Promise((resolve) => {
              finishProfile = resolve;
              profileStarted?.();
            });
          return { data: { banned: this.filters.id === 'banned' } };
        },
      };
    },
    rpc(name) {
      assert.equal(name, 'authorize_api_request');
      return {
        async single() {
          charges++;
          return {
            data: {
              valid: true,
              user_id: 'member',
              plan: 'free',
              remaining: 99,
            },
          };
        },
      };
    },
  },
};
test('screenshot route enforces active keys, bans, runtime readiness, DNS checks and capacity before charging quota', async () => {
  const app = express();
  app.use((req, res, next) => {
    res.once('close', () => clientClosed?.());
    next();
  });
  app.use('/api/tools', require('../backend/routes/tools'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/tools/ssweb`;
  const request = (query = 'url=https://example.com', key, options = {}) =>
    fetch(base + '?' + query, {
      headers: key ? { 'x-api-key': key } : {},
      ...options,
    });
  try {
    assert.equal((await request()).status, 401);
    assert.equal((await request(undefined, 'revoked-key')).status, 401);
    assert.equal((await request(undefined, 'banned-key')).status, 403);
    runtimeReady = false;
    assert.equal((await request(undefined, 'valid-key')).status, 503);
    runtimeReady = true;
    databaseError = true;
    assert.equal((await request(undefined, 'valid-key')).status, 503);
    databaseError = false;
    assert.equal(
      (await request('url=http://127.0.0.1', 'valid-key')).status,
      400,
    );
    assert.equal(
      (await request('url=http://private.example.com', 'valid-key')).status,
      400,
    );
    assert.equal(
      (await request('url=https://example.com&waitMs=30001', 'valid-key'))
        .status,
      400,
    );
    assert.equal(charges, 0);
    holdProfile = true;
    const profileReady = new Promise((resolve) => (profileStarted = resolve));
    const closed = new Promise((resolve) => (clientClosed = resolve));
    const earlyController = new AbortController();
    const early = request(undefined, 'valid-key', {
      signal: earlyController.signal,
    }).catch(() => null);
    await profileReady;
    earlyController.abort();
    await closed;
    await early;
    clientClosed = null;
    holdProfile = false;
    finishProfile();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      charges,
      0,
      'aborting during key/profile checks must not acquire a permanent capture slot',
    );

    hold = true;
    const ready = new Promise((r) => (started = r));
    const first = request(undefined, 'valid-key');
    await ready;
    assert.equal((await request(undefined, 'valid-key')).status, 503);
    assert.equal(charges, 1);
    finish({
      mode: 'desktop',
      image: { mime_type: 'image/png', base64: 'test' },
    });
    assert.equal((await (await first).json()).success, true);
    const controller = new AbortController();
    const ready2 = new Promise((r) => (started = r));
    const abortedPromise = new Promise((r) => (aborted = r));
    const pending = request(undefined, 'valid-key', {
      signal: controller.signal,
    }).catch(() => null);
    await ready2;
    controller.abort();
    await abortedPromise;
    await pending;
    hold = false;
    assert.equal(
      (await (await request(undefined, 'valid-key')).json()).success,
      true,
    );
    assert.equal(charges, 3);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

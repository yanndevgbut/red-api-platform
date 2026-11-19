const { test } = require("node:test");
const assert = require("node:assert/strict");
const { browserProfile } = require("../backend/lib/stalktt-browser");
test("Countik browser fallback waits for late browser cleanup, rejects concurrent work, and releases capacity on cancellation", async () => {
  let releaseLaunch,
    started,
    closed = false,
    proxyClosed = false;
  const controller = new AbortController(),
    launchStarted = new Promise((r) => (started = r));
  const pending = browserProfile("tiktok", {
    signal: controller.signal,
    runtimeReady: () => true,
    proxyFactory: async () => ({
      url: "http://127.0.0.1:1",
      close: async () => {
        proxyClosed = true;
      },
    }),
    browserFactory: async () => ({
      launch: { args: [] },
      chromium: {
        launch: () => {
          started();
          return new Promise((r) => (releaseLaunch = r));
        },
      },
    }),
  });
  await launchStarted;
  await assert.rejects(browserProfile("tiktok", { runtimeReady: () => true }), {
    code: "PROVIDER_BUSY",
  });
  controller.abort();
  let returned = false;
  pending.catch(() => {
    returned = true;
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(returned, false);
  releaseLaunch({
    close: async () => {
      closed = true;
    },
  });
  await assert.rejects(pending, { code: "PROVIDER_TIMEOUT" });
  assert.equal(closed, true);
  assert.equal(proxyClosed, true);
  await assert.rejects(
    browserProfile("tiktok", { runtimeReady: () => false }),
    { code: "PROVIDER_UNAVAILABLE" },
  );
});

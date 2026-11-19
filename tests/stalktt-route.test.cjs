const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("../backend/node_modules/express");
let status = "maintenance",
  charges = 0,
  calls = 0,
  error = false,
  hold = false,
  started,
  finish;
function stub(name, exports) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub("../backend/config/supabase", {
  from() {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      async maybeSingle() {
        return { data: status ? { status } : null, error: error ? {} : null };
      },
    };
  },
});
stub("../backend/middleware/auth", {
  authorize: () => async (_req, _res, next) => {
    charges++;
    next();
  },
});
stub("../backend/middleware/entitlement", (_req, _res, next) => next());
const actual = require("../backend/lib/stalktt");
stub("../backend/lib/stalktt", {
  ...actual,
  getTikTokProfile: async () => {
    calls++;
    if (hold)
      return new Promise((r) => {
        finish = r;
        started();
      });
    return { username: "tiktok" };
  },
});
test("TikTok Stalk registry maintenance rejects requests before quota and capacity is reserved until work finishes", async () => {
  const app = express();
  app.use("/api/stalk", require("../backend/routes/stalker"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const call = () =>
    fetch(
      `http://127.0.0.1:${server.address().port}/api/stalk/stalktt?username=tiktok`,
      { headers: { "x-api-key": "valid-key" } },
    );
  try {
    assert.equal((await call()).status, 503);
    status = "deprecated";
    assert.equal((await call()).status, 404);
    status = null;
    assert.equal((await call()).status, 404);
    status = "active";
    error = true;
    assert.equal((await call()).status, 503);
    error = false;
    assert.equal(charges, 0);
    assert.equal(calls, 0);
    hold = true;
    const running = new Promise((r) => (started = r)),
      first = call();
    await running;
    assert.equal((await call()).status, 503);
    assert.equal(charges, 1);
    finish({ username: "tiktok" });
    assert.equal((await (await first).json()).success, true);
    hold = false;
    assert.equal((await (await call()).json()).success, true);
    assert.equal(charges, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

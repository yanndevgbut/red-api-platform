const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeUsername,
  normalizeProfile,
  asCount,
  getTikTokProfile,
  errorResponse,
} = require("../backend/lib/stalktt");
const profile = {
  status: "success",
  uniqueId: "TikTok",
  id: "12345678901234567890",
  nickname: "TikTok",
  signature: "<img src=x onerror=alert(1)>",
  followerCount: "9007199254740993",
  followingCount: 0,
  heartCount: 120,
  videoCount: "5",
  privateAccount: false,
  verified: true,
  cache: true,
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
test("TikTok stalk username validation rejects URLs, injection, duplicate inputs and invalid handles", () => {
  assert.equal(normalizeUsername(" @TikTok "), "tiktok");
  assert.equal(normalizeUsername("name.with_123"), "name.with_123");
  for (const value of [
    undefined,
    null,
    {},
    ["tiktok"],
    "",
    "@@tiktok",
    "tiktok.",
    "a".repeat(25),
    "user/name",
    "a?url=http://localhost",
    "https://tiktok.com/@tiktok",
    "<script>",
    "user\nname",
  ])
    assert.throws(() => normalizeUsername(value), { code: "INVALID_USERNAME" });
});
test("profile contract preserves large string counts, unknown fields and provider cache indicators without inventing data", () => {
  const result = normalizeProfile(profile, "tiktok");
  assert.equal(result.username, "TikTok");
  assert.equal(result.user_id, profile.id);
  assert.equal(result.bio, profile.signature);
  assert.equal(result.stats.followers, "9007199254740993");
  assert.equal(result.stats.following, 0);
  assert.equal(result.stats.videos, 5);
  assert.equal(result.country, null);
  assert.equal(result.source_cached, true);
  assert.equal(result.private_account, false);
  assert.equal(result.verified_reported, true);
  assert.equal(result.completeness.required_fields_complete, true);
  const incomplete = normalizeProfile({ uniqueId: "tiktok" }, "tiktok");
  assert.equal(incomplete.completeness.required_fields_complete, false);
  assert.ok(incomplete.completeness.missing_fields.includes("followers"));
  assert.equal(incomplete.stats.likes, null);
  assert.equal(incomplete.verified_reported, null);
  for (const invalid of [
    null,
    -1,
    1.2,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "1M",
    "-1",
  ])
    assert.equal(asCount(invalid), null);
  assert.throws(() => normalizeProfile({ uniqueId: "other" }, "tiktok"), {
    code: "USERNAME_MISMATCH",
  });
});
test("TikTok profile lookup uses a fixed Countik HTTPS target with timeout, cancellation and matching account identity", async () => {
  let calls = 0;
  const result = await getTikTokProfile("@TikTok", {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, "https://countik.com/api/exist/tiktok");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Origin, "https://countik.com");
      assert.equal(options.headers["x-api-key"], undefined);
      assert.ok(options.signal instanceof AbortSignal);
      return json(profile);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.provider, "countik.com");
  await assert.rejects(
    getTikTokProfile("bad/handle", {
      fetchImpl: () => assert.fail("must not contact provider"),
    }),
    { code: "INVALID_USERNAME" },
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    getTikTokProfile("tiktok", {
      signal: controller.signal,
      fetchImpl: async (_url, options) => options.signal.throwIfAborted(),
    }),
    { name: "AbortError" },
  );
});
test("provider errors, missing users, non-JSON, mismatched profiles and oversized streamed responses cannot report success", async () => {
  for (const [response, code] of [
    [json({}, 429), "RATE_LIMITED"],
    [new Response("<html>blocked</html>"), "NON_JSON_RESPONSE"],
    [json(null), "INVALID_RESPONSE"],
    [json([]), "INVALID_RESPONSE"],
    [json({}), "INVALID_RESPONSE"],
    [json({ ...profile, uniqueId: "other" }), "USERNAME_MISMATCH"],
    [
      json({ status: "error", message: "User not found" }, 404),
      "USER_NOT_FOUND",
    ],
    [
      new Response("{bad", { headers: { "content-type": "application/json" } }),
      "INVALID_RESPONSE",
    ],
    [
      new Response("x".repeat(1024 * 1024 + 1), {
        headers: { "content-type": "application/json" },
      }),
      "INVALID_RESPONSE",
    ],
  ])
    await assert.rejects(
      getTikTokProfile("tiktok", { fetchImpl: async () => response }),
      { code },
    );
  assert.equal(
    errorResponse({ code: "RATE_LIMITED", message: "Later" }).status,
    429,
  );
  assert.equal(
    errorResponse({ code: "USER_NOT_FOUND", message: "Missing" }).status,
    404,
  );
  assert.equal(errorResponse({ name: "TimeoutError" }).status, 504);
  assert.equal(
    errorResponse({
      message: "secret internal host",
    }).body.error.message.includes("secret"),
    false,
  );
});

test("HTTP 403 retries through an isolated browser session and reports persistent provider blocking explicitly", async () => {
  let calls = 0;
  const result = await getTikTokProfile("tiktok", {
    fetchImpl: async () => json({}, 403),
    browserImpl: async (username, { signal }) => {
      calls++;
      assert.equal(username, "tiktok");
      assert.ok(signal instanceof AbortSignal);
      return json(profile);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.username, "TikTok");
  await assert.rejects(
    getTikTokProfile("tiktok", {
      fetchImpl: async () => json({}, 403),
      browserImpl: async () => new Response("Forbidden", { status: 403 }),
    }),
    { code: "PROVIDER_BLOCKED" },
  );
  assert.equal(
    errorResponse({ code: "PROVIDER_BLOCKED", message: "Blocked" }).status,
    503,
  );
});

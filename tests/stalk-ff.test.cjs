const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lookup, parseProfile, isValidUid, getBrRank, getCsRank, estimateTopUp } = require('../backend/lib/stalk-ff');
const data = { basicInfo: { accountId: '12345678', nickname: 'Test Player', rankingPoints: 3500, csRank: 320, csRankingPoints: 114, primeInfo: { primeLevel: 8 }, liked: 50, level: 60, region: 'ID', hasElitePass: true }, socialInfo: { signature: '<script>untrusted text</script>' } };

test('Free Fire UID is numeric, scalar and limited to 8–11 digits', () => {
  for (const value of ['12345678', '12345678901']) assert.equal(isValidUid(value), true);
  for (const value of ['1234567', '123456789012', '../etc/passwd', '12345678&url=http://localhost', ['12345678'], null]) assert.equal(isValidUid(value), false);
});
test('rank rules and top-up estimates preserve the supplied scraper contract', () => {
  assert.equal(getBrRank(3500), 'Heroic I');
  assert.equal(getCsRank(320, 114), 'Elite Heroic (24 bintang)');
  const profile = parseProfile(data, '12345678');
  assert.equal(profile.nickname, 'Test Player'); assert.equal(profile.booyahPass, 'Nyala');
  assert.equal(profile.serverRegion, 'Indonesia (ID)'); assert.equal(profile.bio, data.socialInfo.signature);
  const estimate = estimateTopUp(data.basicInfo); assert.ok(estimate.maximum > estimate.minimum);
  assert.match(profile.topUpEstimateNote, /estimasi/i);
  assert.throws(() => parseProfile({ basicInfo: {} }, '12345678'), /not found/);
  assert.throws(() => parseProfile(data, '87654321'), /different account/);
  assert.equal(parseProfile({ basicInfo: { nickname: 'test', liked: 'Infinity', level: -1 } }, '12345678').likes, 0);
});
test('provider requests use a fixed origin, bounded response and explicit failures', async () => {
  let requested;
  const result = await lookup('12345678', { fetchImpl: async (url, options) => { requested = { url, options }; return new Response(JSON.stringify(data)); } });
  assert.equal(new URL(requested.url).origin, 'https://adenpedia.my.id');
  assert.equal(new URL(requested.url).searchParams.get('uid'), '12345678');
  assert.equal(requested.options.redirect, 'error'); assert.equal(result.uid, '12345678');
  await assert.rejects(lookup('not-valid', { fetchImpl: async () => { throw new Error('must not fetch'); } }), /8–11/);
  await assert.rejects(lookup('12345678', { fetchImpl: async () => new Response('bad json') }), /not JSON/);
  await assert.rejects(lookup('12345678', { fetchImpl: async () => new Response('{}', { status: 503 }) }), /unavailable/);
  await assert.rejects(lookup('12345678', { fetchImpl: async () => new Response('a'.repeat(512 * 1024 + 1)) }), /too large/);
  await assert.rejects(lookup('12345678', { fetchImpl: async () => { throw new DOMException('timed out', 'TimeoutError'); } }), error => error.name === 'TimeoutError');
});

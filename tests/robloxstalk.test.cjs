const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUsername, robloxStalk, errorResponse } = require('../backend/lib/robloxstalk');

const ID = 156;
const profileUrl = `https://users.roblox.com/v1/users/${ID}`;
const lookupUrl = 'https://users.roblox.com/v1/usernames/users';
const social = `https://friends.roblox.com/v1/users/${ID}`;
const groupsUrl = `https://groups.roblox.com/v1/users/${ID}/groups/roles`;
const gamesUrl = `https://games.roblox.com/v2/users/${ID}/games?accessFilter=Public&limit=10&sortOrder=Desc`;
const avatarUrl = `https://thumbnails.roblox.com/v1/users/avatar?userIds=${ID}&size=420x420&format=Png&isCircular=false`;
const headshotUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ID}&size=150x150&format=Png&isCircular=false`;

const json = (payload, init = {}) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

function upstream(overrides = {}) {
  const calls = [];
  const routes = {
    [lookupUrl]: () => json({ data: [{ id: ID, name: 'Roblox' }] }),
    [profileUrl]: () => json({
      id: ID,
      name: 'Roblox',
      displayName: 'Roblox',
      description: 'Official Roblox account',
      created: '2006-02-27T21:06:40.77Z',
      isBanned: false,
      hasVerifiedBadge: true,
    }),
    [`${social}/friends/count`]: () => json({ count: 10 }),
    [`${social}/followers/count`]: () => json({ count: 20 }),
    [`${social}/followings/count`]: () => json({ count: 30 }),
    [avatarUrl]: () => json({ data: [{ targetId: ID, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/avatar.png' }] }),
    [headshotUrl]: () => json({ data: [{ targetId: ID, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/headshot.png' }] }),
    [groupsUrl]: () => json({ data: [{ group: { id: 7, name: 'Builders Club', memberCount: 1234 }, role: { name: 'Member', rank: 1 } }] }),
    [gamesUrl]: () => json({
      data: [{ id: 9, name: 'My Game', placeVisits: 4321, rootPlace: { id: 8 } }],
      nextPageCursor: null,
    }),
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const handler = overrides[url] || routes[url];
    if (!handler) throw new Error(`unexpected request to ${url}`);
    return handler(url, options);
  };
  return { calls, fetchImpl };
}

test('robloxstalk validates Roblox usernames only', () => {
  assert.equal(normalizeUsername(' Roblox '), 'Roblox');
  assert.equal(normalizeUsername('@Roblox'), 'Roblox');
  assert.equal(normalizeUsername('a_b1'), 'a_b1');
  for (const input of ['', 'ab', 'a'.repeat(21), 'bad name', 'bad-name', '@', 'https://www.roblox.com/users/1/profile', ['Roblox'], null, 123]) {
    assert.throws(() => normalizeUsername(input), { code: 'invalid_username' });
  }
  const mapped = errorResponse(Object.assign(new Error('x'), { code: 'invalid_username' }));
  assert.equal(mapped.status, 400);
  assert.deepEqual(mapped.body.error, { code: 'INVALID_USERNAME', message: 'Gunakan username Roblox, bukan display name.' });
});

test('robloxstalk returns the full public profile with nine allowlisted requests', async () => {
  const { calls, fetchImpl } = upstream();
  const data = await robloxStalk('Roblox', { fetchImpl });
  assert.equal(calls.length, 9);
  for (const { url, options } of calls) {
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    assert.ok(['users.roblox.com', 'friends.roblox.com', 'thumbnails.roblox.com', 'groups.roblox.com', 'games.roblox.com'].includes(new URL(url).hostname));
  }
  const lookup = calls.find(({ url }) => url === lookupUrl);
  assert.equal(lookup.options.method, 'POST');
  assert.deepEqual(JSON.parse(lookup.options.body), { usernames: ['Roblox'], excludeBannedUsers: false });
  assert.equal(data.id, ID);
  assert.equal(data.username, 'Roblox');
  assert.equal(data.display_name, 'Roblox');
  assert.equal(data.bio, 'Official Roblox account');
  assert.equal(data.created_at, '2006-02-27T21:06:40.77Z');
  assert.equal(data.is_banned, false);
  assert.equal(data.verified, true);
  assert.equal(data.profile_url, `https://www.roblox.com/users/${ID}/profile`);
  assert.equal(data.friends, 10);
  assert.equal(data.followers, 20);
  assert.equal(data.following, 30);
  assert.deepEqual(data.avatar, { state: 'Completed', url: 'https://tr.rbxcdn.com/avatar.png' });
  assert.deepEqual(data.headshot, { state: 'Completed', url: 'https://tr.rbxcdn.com/headshot.png' });
  assert.deepEqual(data.groups, [{ id: 7, name: 'Builders Club', members: 1234, role: 'Member', rank: 1 }]);
  assert.equal(data.group_count, 1);
  assert.deepEqual(data.experiences, {
    has_more: false,
    items: [{ universe_id: 9, name: 'My Game', visits: 4321, url: 'https://www.roblox.com/games/8' }],
  });
  assert.deepEqual(data.errors, {});
});

test('robloxstalk accepts @ and mixed case, matching the canonical username', async () => {
  const { calls, fetchImpl } = upstream();
  const data = await robloxStalk('@RoBlOx', { fetchImpl });
  assert.equal(JSON.parse(calls[0].options.body).usernames[0], 'RoBlOx');
  assert.equal(data.username, 'Roblox');
});

test('robloxstalk maps lookup and HTTP failures', async () => {
  await assert.rejects(robloxStalk('Roblox', { fetchImpl: upstream({ [lookupUrl]: () => json({ data: [] }) }).fetchImpl }), { code: 'not_found' });
  await assert.rejects(robloxStalk('Roblox', { fetchImpl: upstream({ [lookupUrl]: () => new Response(null, { status: 404 }) }).fetchImpl }), { code: 'not_found' });
  await assert.rejects(robloxStalk('Roblox', { fetchImpl: upstream({ [lookupUrl]: () => new Response(null, { status: 429 }) }).fetchImpl }), { code: 'rate_limited' });
  await assert.rejects(robloxStalk('Roblox', { fetchImpl: upstream({ [lookupUrl]: () => new Response(null, { status: 403 }) }).fetchImpl }), { code: 'restricted' });
  await assert.rejects(robloxStalk('Roblox', { fetchImpl: upstream({ [lookupUrl]: () => new Response(null, { status: 500 }) }).fetchImpl }), { code: 'upstream_error' });
  await assert.rejects(robloxStalk('Roblox', {
    fetchImpl: upstream({ [lookupUrl]: () => { throw new DOMException('Timed out', 'TimeoutError'); } }).fetchImpl,
  }), { code: 'timeout' });
  await assert.rejects(robloxStalk('Roblox', {
    fetchImpl: upstream({ [lookupUrl]: () => { throw new TypeError('fetch failed'); } }).fetchImpl,
  }), { code: 'network_error' });
  await assert.rejects(robloxStalk('Roblox', { fetchImpl: upstream({ [lookupUrl]: () => new Response('<html>') }).fetchImpl }), { code: 'unexpected_response' });
  assert.equal(errorResponse(Object.assign(new Error('x'), { code: 'rate_limited' })).status, 429);
  assert.equal(errorResponse(Object.assign(new Error('x'), { code: 'restricted' })).status, 403);
  assert.equal(errorResponse(Object.assign(new Error('x'), { code: 'not_found' })).status, 404);
  assert.equal(errorResponse(Object.assign(new Error('x'), { code: 'network_error' })).status, 504);
  assert.equal(errorResponse(new DOMException('Timed out', 'AbortError')).status, 504);
  assert.equal(errorResponse(new Error('boom')).body.error.code, 'ROBLOX_RESPONSE');
});

test('robloxstalk rejects redirects without calling the redirected origin', async () => {
  const { calls, fetchImpl } = upstream({
    [lookupUrl]: () => new Response(null, { status: 302, headers: { location: 'https://outside.example/' } }),
  });
  await assert.rejects(robloxStalk('Roblox', { fetchImpl }), { code: 'upstream_error' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, 'error');
});

test('robloxstalk maps cancellation during body reads to a timeout', async () => {
  const controller = new AbortController();
  const { fetchImpl } = upstream({
    [lookupUrl]: (_url, { signal }) => new Response(new ReadableStream({
      start(stream) {
        signal.addEventListener('abort', () => stream.error(signal.reason), { once: true });
        queueMicrotask(() => controller.abort());
      },
    })),
  });
  await assert.rejects(robloxStalk('Roblox', { fetchImpl, signal: controller.signal }), { code: 'timeout' });
});

test('robloxstalk caps the response body and cancels oversized streams', async () => {
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(512 * 1024 + 1)); },
    cancel() { canceled = true; },
  });
  await assert.rejects(robloxStalk('Roblox', {
    fetchImpl: upstream({ [lookupUrl]: () => new Response(stream) }).fetchImpl,
  }), { code: 'unexpected_response' });
  assert.equal(canceled, true);
});

test('robloxstalk keeps partial profiles when a subresource fails', async () => {
  const { fetchImpl } = upstream({ [groupsUrl]: () => new Response(null, { status: 429 }) });
  const data = await robloxStalk('Roblox', { fetchImpl });
  assert.equal(data.username, 'Roblox');
  assert.equal(data.groups, null);
  assert.equal(data.group_count, null);
  assert.deepEqual(data.errors, { groups: { code: 'RATE_LIMITED', http_status: 429 } });
  assert.equal(data.friends, 10);
});

test('robloxstalk reports thumbnail states that are not completed', async () => {
  const { fetchImpl } = upstream({
    [avatarUrl]: () => json({ data: [{ targetId: ID, state: 'Pending', imageUrl: 'https://tr.rbxcdn.com/pending.png' }] }),
  });
  const data = await robloxStalk('Roblox', { fetchImpl });
  assert.deepEqual(data.avatar, { state: 'Pending', url: null });
});

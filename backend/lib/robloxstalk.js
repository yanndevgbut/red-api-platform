const HOSTS = new Set([
  'users.roblox.com',
  'friends.roblox.com',
  'thumbnails.roblox.com',
  'groups.roblox.com',
  'games.roblox.com',
]);
const USERNAME = /^[a-z0-9_]{3,20}$/i;
const LIMIT = 512 * 1024;
const BUDGET_MS = 15000;
const STEP_MS = 5000;
const messages = {
  invalid_username: [400, 'Gunakan username Roblox, bukan display name.'],
  not_found: [404, 'Username Roblox tidak ditemukan.'],
  rate_limited: [429, 'Roblox membatasi permintaan. Coba lagi nanti.'],
  restricted: [403, 'Roblox menolak permintaan dari server ini.'],
  timeout: [504, 'Waktu tunggu Roblox habis.'],
  network_error: [504, 'Gagal menghubungi Roblox.'],
  unexpected_response: [502, 'Respons Roblox tidak sesuai.'],
  upstream_error: [502, 'Roblox belum dapat mengembalikan data profil.'],
};
const exposed = {
  invalid_username: 'INVALID_USERNAME',
  not_found: 'NOT_FOUND',
  rate_limited: 'RATE_LIMITED',
  restricted: 'ROBLOX_RESTRICTED',
  timeout: 'ROBLOX_TIMEOUT',
  network_error: 'ROBLOX_TIMEOUT',
  unexpected_response: 'ROBLOX_RESPONSE',
  upstream_error: 'ROBLOX_RESPONSE',
};
const exposedCode = (code) => exposed[code] || 'ROBLOX_RESPONSE';
const fail = (code, httpStatus = null) => Object.assign(new Error(messages[code][1]), { code, httpStatus });
const expect = (condition, code = 'unexpected_response') => {
  if (!condition) throw fail(code);
};

function normalizeUsername(value) {
  const input = typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
  if (!USERNAME.test(input)) throw fail('invalid_username');
  return input;
}

function allowed(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !HOSTS.has(url.hostname)) return null;
  return url;
}

async function readJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw fail('unexpected_response');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMIT) {
        await reader.cancel();
        throw fail('unexpected_response');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } catch {
    throw fail('unexpected_response');
  }
}

async function request(value, { fetchImpl, signal, ...init }) {
  const url = allowed(value);
  if (!url) throw fail('unexpected_response');
  try {
    signal.throwIfAborted();
    const response = await fetchImpl(url.href, { ...init, redirect: 'error', signal });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) throw fail('rate_limited', response.status);
      if ([401, 403].includes(response.status)) throw fail('restricted', response.status);
      if ([404, 410].includes(response.status)) throw fail('not_found', response.status);
      throw fail('upstream_error', response.status);
    }
    return await readJson(response);
  } catch (error) {
    if (signal.aborted || ['TimeoutError', 'AbortError'].includes(error?.name)) throw fail('timeout');
    if (Object.hasOwn(messages, error?.code)) throw error;
    throw fail('network_error');
  }
}

const asCount = (payload) => {
  expect(Number.isSafeInteger(payload?.count) && payload.count >= 0);
  return payload.count;
};
const asRows = (payload) => {
  expect(Array.isArray(payload?.data));
  return payload.data;
};
const asImage = (id) => (payload) => {
  const item = asRows(payload).find((row) => row?.targetId === id);
  expect(typeof item?.state === 'string');
  const url = item.state === 'Completed' ? item.imageUrl : null;
  return { state: item.state, url: typeof url === 'string' && url.startsWith('https://') ? url : null };
};

async function robloxStalk(username, { fetchImpl = fetch, signal } = {}) {
  const name = normalizeUsername(username);
  const deadline = AbortSignal.timeout(BUDGET_MS);
  const shared = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const scope = () => AbortSignal.any([shared, AbortSignal.timeout(STEP_MS)]);

  const lookup = await request('https://users.roblox.com/v1/usernames/users', {
    fetchImpl,
    signal: scope(),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ usernames: [name], excludeBannedUsers: false }),
  });
  const rows = asRows(lookup);
  const match = rows.find((row) => typeof row?.name === 'string' && row.name.toLowerCase() === name.toLowerCase());
  if (!match) throw fail('not_found');
  const id = match.id;
  expect(Number.isSafeInteger(id) && id > 0);

  shared.throwIfAborted();
  const profile = await request(`https://users.roblox.com/v1/users/${id}`, {
    fetchImpl,
    signal: scope(),
    headers: { Accept: 'application/json' },
  });
  expect(Number(profile?.id) === id && typeof profile.name === 'string');

  const social = `https://friends.roblox.com/v1/users/${id}`;
  const thumbnails = 'https://thumbnails.roblox.com/v1/users';
  const endpoints = {
    friends: [`${social}/friends/count`, asCount],
    followers: [`${social}/followers/count`, asCount],
    following: [`${social}/followings/count`, asCount],
    avatar: [`${thumbnails}/avatar?userIds=${id}&size=420x420&format=Png&isCircular=false`, asImage(id)],
    headshot: [`${thumbnails}/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`, asImage(id)],
    groups: [
      `https://groups.roblox.com/v1/users/${id}/groups/roles`,
      (payload) => asRows(payload).map(({ group, role }) => ({
        id: group?.id ?? null,
        name: group?.name ?? null,
        members: Number.isSafeInteger(group?.memberCount) ? group.memberCount : null,
        role: role?.name ?? null,
        rank: Number.isSafeInteger(role?.rank) ? role.rank : null,
      })),
    ],
    experiences: [
      `https://games.roblox.com/v2/users/${id}/games?accessFilter=Public&limit=10&sortOrder=Desc`,
      (payload) => ({
        has_more: Boolean(payload?.nextPageCursor),
        items: asRows(payload).map((game) => ({
          universe_id: game?.id ?? null,
          name: game?.name ?? null,
          visits: Number.isSafeInteger(game?.placeVisits) ? game.placeVisits : null,
          url: game?.rootPlace?.id ? `https://www.roblox.com/games/${game.rootPlace.id}` : null,
        })),
      }),
    ],
  };

  const result = {
    id,
    username: profile.name,
    display_name: typeof profile.displayName === 'string' ? profile.displayName : null,
    bio: typeof profile.description === 'string' ? profile.description : null,
    created_at: typeof profile.created === 'string' ? profile.created : null,
    is_banned: typeof profile.isBanned === 'boolean' ? profile.isBanned : null,
    verified: typeof profile.hasVerifiedBadge === 'boolean' ? profile.hasVerifiedBadge : null,
    profile_url: `https://www.roblox.com/users/${id}/profile`,
    fetched_at: new Date().toISOString(),
    errors: {},
  };

  const fields = Object.keys(endpoints);
  const settled = await Promise.allSettled(fields.map(async (field) => {
    const [url, parse] = endpoints[field];
    return parse(await request(url, { fetchImpl, signal: scope(), headers: { Accept: 'application/json' } }));
  }));
  settled.forEach((outcome, index) => {
    const field = fields[index];
    if (outcome.status === 'fulfilled') result[field] = outcome.value;
    else {
      result[field] = null;
      result.errors[field] = {
        code: exposedCode(Object.hasOwn(messages, outcome.reason?.code) ? outcome.reason.code : 'unexpected_response'),
        http_status: outcome.reason?.httpStatus ?? null,
      };
    }
  });
  result.group_count = Array.isArray(result.groups) ? result.groups.length : null;
  return result;
}

function errorResponse(error) {
  const code = ['TimeoutError', 'AbortError'].includes(error.name)
    ? 'timeout'
    : Object.hasOwn(messages, error.code) ? error.code : 'unexpected_response';
  const [status, message] = messages[code];
  return { status, body: { success: false, error: { code: exposedCode(code), message } } };
}

module.exports = { normalizeUsername, robloxStalk, errorResponse };

const API_URL = 'https://adenpedia.my.id/update01/info.php';
const REQUEST_TIMEOUT_MS = 15000;

function formatNumber(value) {
  return safeNumber(value || 0).toLocaleString('id-ID');
}

function getBrRank(points) {
  const tiers = [
    [1000, 'Bronze I'], [1100, 'Bronze II'], [1200, 'Bronze III'],
    [1310, 'Silver I'], [1410, 'Silver II'], [1600, 'Silver III'],
    [1610, 'Gold I'], [1735, 'Gold II'], [1860, 'Gold III'], [1985, 'Gold IV'],
    [2110, 'Platinum I'], [2235, 'Platinum II'], [2360, 'Platinum III'],
    [2485, 'Platinum IV'], [2610, 'Platinum V'],
    [2760, 'Diamond I'], [2910, 'Diamond II'], [3060, 'Diamond III'],
    [3210, 'Diamond IV'], [3350, 'Diamond V'],
    [3500, 'Heroic I'], [4100, 'Heroic II'], [4300, 'Heroic III'],
    [4900, 'Heroic IV'], [5500, 'Heroic V'], [6300, 'Master I'],
    [7100, 'Master II'], [8000, 'Master III'], [9000, 'Master IV'], [10000, 'Master V'],
  ];
  let result = 'Unranked';
  for (const [minimum, name] of tiers) {
    if (points < minimum) break;
    result = name;
  }
  return result;
}

function getCsRank(rankId, points) {
  if (rankId >= 320) {
    const stars = Math.max(0, points - 90);
    if (stars >= 100) return `Elite Master (${stars} bintang)`;
    if (stars >= 50) return `Master (${stars} bintang)`;
    if (stars >= 24) return `Elite Heroic (${stars} bintang)`;
    return `Heroic (${stars} bintang)`;
  }
  if (points <= 0) return 'Bronze';
  if (points < 9) return `Bronze (${points} bintang)`;
  if (points < 21) return `Silver (${points} bintang)`;
  if (points < 37) return `Gold (${points} bintang)`;
  if (points < 62) return `Platinum (${points} bintang)`;
  if (points < 87) return `Diamond (${points} bintang)`;
  const stars = Math.max(0, points - 90);
  if (stars >= 100) return `Elite Master (${stars} bintang)`;
  if (stars >= 50) return `Master (${stars} bintang)`;
  if (stars >= 24) return `Elite Heroic (${stars} bintang)`;
  return `Heroic (${stars} bintang)`;
}

function estimateTopUp(basic) {
  const primeLevel = safeNumber(basic.primeInfo?.primeLevel || 0);
  const baseByPrime = {
    1: 12800, 2: 128000, 3: 384000, 4: 1280000,
    5: 3840000, 6: 7680000, 7: 15360000,
  };
  const extras = safeNumber(basic.liked || 0) * 12 + safeNumber(basic.level || 0) * 8500;

  if (primeLevel >= 8) {
    return {
      minimum: Math.floor((25600000 + extras) / 1000) * 1000,
      maximum: Math.floor((51600000 + extras) / 1000) * 1000,
      note: 'Kisaran estimasi; situs memakai nilai acak/cache untuk Prime 8 ke atas.',
    };
  }

  const amount = Math.floor(((baseByPrime[primeLevel] || 50000) + extras) / 1000) * 1000;
  return { minimum: amount, maximum: amount, note: 'Estimasi situs, bukan riwayat transaksi resmi.' };
}

function safeNumber(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) && result >= 0 && result <= 1000000000 ? result : 0;
}

function isValidUid(uid) { return typeof uid === 'string' && /^\d{8,11}$/.test(uid); }
class ProfileNotFoundError extends Error { constructor() { super('Free Fire profile not found'); this.name = 'ProfileNotFoundError'; } }

function parseProfile(data, uid) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid provider response');
  if (data.error) throw new Error('Provider could not retrieve profile');
  const basic = data.basicInfo;
  if (!basic || typeof basic.nickname !== 'string' || !basic.nickname.trim()) throw new ProfileNotFoundError();
  if (basic.accountId != null && String(basic.accountId).replace(/^0+/, '') !== uid.replace(/^0+/, '')) throw new Error('Provider returned a different account');
  const pointsBr = safeNumber(basic.rankingPoints);
  const pointsCs = safeNumber(basic.csRankingPoints);
  const primeLevel = safeNumber(basic.primeInfo?.primeLevel);
  const topUp = estimateTopUp(basic);
  const regionNames = { ID: 'Indonesia', SG: 'Singapore', TH: 'Thailand', VN: 'Vietnam' };
  const region = typeof basic.region === 'string' ? basic.region.slice(0, 16) : '';
  const signature = typeof data.socialInfo?.signature === 'string' && data.socialInfo.signature ? data.socialInfo.signature : typeof basic.signature === 'string' && basic.signature ? basic.signature : 'Tidak ada bio';
  return {
    uid, nickname: basic.nickname.slice(0, 128),
    rankBR: `${getBrRank(pointsBr)} (${formatNumber(pointsBr)} poin)`,
    rankCS: `${getCsRank(safeNumber(basic.csRank), pointsCs)} (${formatNumber(pointsCs)} poin API)`,
    primeLevel, bio: signature.slice(0, 4000), likes: safeNumber(basic.liked), playerLevel: safeNumber(basic.level),
    serverRegion: `${regionNames[region] || region || 'Tidak diketahui'} (${region || '?'})`,
    booyahPass: basic.hasElitePass === true ? 'Nyala' : 'Mati',
    estimatedTopUpIDR: topUp.minimum === topUp.maximum ? `Rp ${formatNumber(topUp.minimum)}` : `Rp ${formatNumber(topUp.minimum)} – Rp ${formatNumber(topUp.maximum)}`,
    topUpEstimateNote: topUp.note,
  };
}

async function lookup(uid, { fetchImpl = fetch, signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS) } = {}) {
  if (!isValidUid(uid)) throw new TypeError('UID must contain 8–11 digits');
  const url = new URL(API_URL);
  url.searchParams.set('uid', uid);
  const response = await fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': 'stalkff-cli/1.0' }, redirect: 'error', signal });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) throw new ProfileNotFoundError();
    throw new Error('Provider unavailable');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty provider response');
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 512 * 1024) { await reader.cancel(); throw new Error('Provider response too large'); }
    chunks.push(value);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Provider response is not JSON'); }
  return parseProfile(data, uid);
}

module.exports = { lookup, parseProfile, isValidUid, getBrRank, getCsRank, estimateTopUp };

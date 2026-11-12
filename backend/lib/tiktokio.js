const { load } = require('cheerio');
const ORIGIN = 'https://tiktokio.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_HTML_BYTES = 2 * 1024 * 1024;

function isTikTokUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'));
  } catch { return false; }
}

function safeLink(value) {
  if (typeof value !== 'string' || value.length > 16384) return null;
  try {
    const url = new URL(value, ORIGIN);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

async function readHtml(response) {
  if (!response.ok || !/^text\/html\b/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel();
    throw new Error('Unexpected TikTokio response');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty TikTokio response');
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) { await reader.cancel(); throw new Error('TikTokio response too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseResult(html) {
  const $ = load(html);
  const links = [];
  const seen = new Set();
  $('.download-links a[href]').each((_i, element) => {
    const link = safeLink($(element).attr('href'));
    if (!link || seen.has(link) || links.length >= 20) return;
    seen.add(link);
    links.push({ type: $(element).text().trim().slice(0, 160) || 'Download', link });
  });
  if (!links.length) throw new Error('No downloadable media found');
  return {
    status: 'success',
    title: $('.video-info h3').text().trim().slice(0, 4000),
    thumbnail: safeLink($('.video-info img').attr('src')),
    links,
  };
}

async function tiktokio(videoUrl, { fetchImpl = fetch, signal = AbortSignal.timeout(15000) } = {}) {
  if (!isTikTokUrl(videoUrl)) throw new TypeError('Invalid TikTok URL');
  const session = await fetchImpl(ORIGIN + '/', { headers: { 'User-Agent': USER_AGENT }, redirect: 'error', signal });
  // Send only cookie name/value pairs, not Set-Cookie attributes such as Path or HttpOnly.
  const cookies = session.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  await readHtml(session);
  const response = await fetchImpl(ORIGIN + '/api/v1/tk/html', {
    method: 'POST', redirect: 'error', signal,
    headers: {
      'Content-Type': 'application/json', Origin: ORIGIN, Referer: ORIGIN + '/', 'User-Agent': USER_AGENT,
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: JSON.stringify({ vid: videoUrl.trim(), prefix: 'tiktokio.com' }),
  });
  return parseResult(await readHtml(response));
}

module.exports = { tiktokio, parseResult, isTikTokUrl };

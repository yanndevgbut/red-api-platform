const API = 'https://www.mediafire.com/api/1.5/file/get_info.php';
const PAGE_HOSTS = new Set(['mediafire.com', 'www.mediafire.com', 'm.mediafire.com']);
const CDN_HOST = /^download\d*\.mediafire\.com$/;
const KEY = /^[a-z0-9]{13,20}$/i;
const FILE_PATH = /^\/(?:file|view|download)\/([a-z0-9]{13,20})(?:\/[^/]+)?(?:\/(?:file|view))?$/i;
const CDN_PATH = /^\/[^/]+\/([a-z0-9]{13,20})\/[^/]+\/?$/i;
const errors = {
  INVALID_URL: [400, 'Gunakan URL HTTPS MediaFire atau quickkey yang valid.'],
  FOLDER_UNSUPPORTED: [422, 'Link folder belum didukung. Gunakan link satu file.'],
  FILE_NOT_FOUND: [404, 'File MediaFire tidak ditemukan.'],
  FILE_REMOVED: [410, 'File MediaFire sudah dihapus.'],
  RATE_LIMITED: [429, 'MediaFire membatasi permintaan. Coba lagi nanti.'],
  MEDIAFIRE_TIMEOUT: [504, 'Waktu tunggu MediaFire habis.'],
  MEDIAFIRE_RESPONSE: [502, 'MediaFire belum dapat mengembalikan metadata file.'],
};
const fail = (code) => Object.assign(new Error(errors[code][1]), { code });
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const canonicalPage = (key) => `https://www.mediafire.com/file/${key}/file`;

function allowedUrl(value, hostAllowed) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hostAllowed(url.hostname)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function validate(value) {
  if (typeof value !== 'string' || value.length > 2048) throw fail('INVALID_URL');
  const raw = value.trim();
  if (KEY.test(raw)) return raw.toLowerCase();
  const url = allowedUrl(raw, (host) => PAGE_HOSTS.has(host) || CDN_HOST.test(host));
  if (!url) throw fail('INVALID_URL');
  const path = url.pathname.replace(/\/+$/, '');
  if (CDN_HOST.test(url.hostname)) {
    const key = path.match(CDN_PATH)?.[1];
    if (!key) throw fail('INVALID_URL');
    return key.toLowerCase();
  }
  if (/^\/folder\//i.test(path)) throw fail('FOLDER_UNSUPPORTED');
  const key = path.match(FILE_PATH)?.[1] || path.slice(1) || url.search.slice(1).split('&', 1)[0];
  if (!KEY.test(key || '')) throw fail('INVALID_URL');
  return key.toLowerCase();
}

async function request(value, { fetchImpl, signal, limit, accept, hostAllowed }) {
  let target = value;
  for (let hop = 0; hop <= 3; hop++) {
    const url = allowedUrl(target, hostAllowed);
    if (!url) throw fail('MEDIAFIRE_RESPONSE');
    signal.throwIfAborted();
    const response = await fetchImpl(url.href, {
      redirect: 'manual', signal,
      headers: { Accept: accept, 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'RED API MediaFire Downloader' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || hop === 3) throw fail('MEDIAFIRE_RESPONSE');
      target = new URL(location, url).href;
      continue;
    }
    if (!response.ok || Number(response.headers.get('content-length')) > limit || !response.body) {
      await response.body?.cancel();
      if (response.status === 429) throw fail('RATE_LIMITED');
      if (response.status === 404) throw fail('FILE_NOT_FOUND');
      if (response.status === 410) throw fail('FILE_REMOVED');
      throw fail('MEDIAFIRE_RESPONSE');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        bytes += chunk.byteLength;
        if (bytes > limit) {
          await reader.cancel();
          throw fail('MEDIAFIRE_RESPONSE');
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw fail('MEDIAFIRE_RESPONSE');
}

function humanSize(bytes) {
  if (bytes === null) return null;
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit++;
  }
  return `${unit === 0 ? bytes : bytes.toFixed(2)} ${units[unit]}`;
}

function parsePage(html, key) {
  let direct = null;
  for (const [tag] of html.matchAll(/<a\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...tag.matchAll(/\s([\w:-]+)\s*=\s*(['"])(.*?)\2/gs)]
      .map((match) => [match[1].toLowerCase(), match[3]]));
    if (attrs.id !== 'downloadButton') continue;
    const url = allowedUrl(attrs.href?.replace(/&amp;|&#38;|&#x26;/gi, '&'), (host) => CDN_HOST.test(host));
    if (url?.pathname.match(CDN_PATH)?.[1]?.toLowerCase() === key) direct = url.href;
    break;
  }
  return {
    direct,
    removed: /File Removed|file has been removed|This file is no longer available/i.test(html.slice(0, 60000)),
    password: /<input\b[^>]*\stype\s*=\s*(?:"password"|'password'|password(?=[\s>]))/i.test(html),
  };
}

async function scrape(quickkey, { fetchImpl = fetch, signal } = {}) {
  if (typeof quickkey !== 'string' || !KEY.test(quickkey)) throw fail('INVALID_URL');
  quickkey = quickkey.toLowerCase();
  const timeout = AbortSignal.timeout(15000);
  const shared = { fetchImpl, signal: signal ? AbortSignal.any([signal, timeout]) : timeout };
  const api = new URL(API);
  api.search = new URLSearchParams({ quick_key: quickkey, response_format: 'json', recursive: 'no' });
  const body = await request(api.href, { ...shared, limit: 512 * 1024, accept: 'application/json', hostAllowed: (host) => host === api.hostname });
  let response;
  try { response = JSON.parse(body)?.response; } catch { throw fail('MEDIAFIRE_RESPONSE'); }
  if (Number(response?.error) === 110 || /invalid quickkey|not found/i.test(response?.message || '')) throw fail('FILE_NOT_FOUND');
  const info = response?.file_info;
  if (response?.result !== 'Success' || !info || typeof info !== 'object' || Array.isArray(info)) throw fail('MEDIAFIRE_RESPONSE');
  if (info.privacy === 'private') throw fail('FILE_NOT_FOUND');
  const filename = text(info.filename);
  const size = typeof info.size === 'number' || /^\d+$/.test(text(info.size) || '') ? Number(info.size) : NaN;
  const sizeBytes = Number.isSafeInteger(size) && size >= 0 ? size : null;
  const pageUrl = canonicalPage(quickkey);
  const warnings = [];
  let page = {};
  if (info.password_protected !== 'yes' && info.ready === 'yes') {
    try {
      page = parsePage(await request(pageUrl, { ...shared, limit: 1024 * 1024, accept: 'text/html,application/xhtml+xml', hostAllowed: (host) => PAGE_HOSTS.has(host) }), quickkey);
    } catch (error) {
      shared.signal.throwIfAborted();
      if (['FILE_NOT_FOUND', 'FILE_REMOVED'].includes(error.code)) throw error;
      warnings.push('Halaman unduhan MediaFire belum dapat dibaca.');
    }
  }
  if (page.removed) throw fail('FILE_REMOVED');
  const passwordProtected = info.password_protected === 'yes' || Boolean(page.password);
  const ready = info.ready === 'yes';
  const direct = ready && !passwordProtected ? page.direct ?? null : null;
  if (!direct) warnings.push(passwordProtected ? 'File dilindungi password.' : 'Tautan unduh publik belum tersedia.');
  return {
    type: 'file',
    quickkey,
    filename,
    size_bytes: sizeBytes,
    size_human: humanSize(sizeBytes),
    extension: filename?.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase() ?? null,
    mimetype: text(info.mimetype),
    sha256: /^[a-f0-9]{64}$/i.test(text(info.hash) || '') ? info.hash.trim() : null,
    password_protected: passwordProtected,
    ready,
    download_available: Boolean(direct),
    urls: { page: pageUrl, direct },
    warnings,
    fetched_at: new Date().toISOString(),
  };
}

function errorResponse(error) {
  const code = ['TimeoutError', 'AbortError'].includes(error.name) ? 'MEDIAFIRE_TIMEOUT'
    : Object.hasOwn(errors, error.code) ? error.code : 'MEDIAFIRE_RESPONSE';
  const [status, message] = errors[code];
  return { status, body: { success: false, error: { code, message } } };
}

module.exports = { validate, scrape, errorResponse };

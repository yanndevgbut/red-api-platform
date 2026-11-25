const { createHash } = require('node:crypto');
const HOSTS = new Set(['pastebin.com', 'www.pastebin.com']);
const ID_PATH = /^\/(?:raw\/)?([A-Za-z0-9]{8})\/?$/;
const LIMIT = 2 * 1024 * 1024;
const BUDGET_MS = 18000;
const ATTEMPT_MS = 8000;
const MAX_REDIRECTS = 2;
const RETRYABLE = new Set(['upstream_error', 'network_error']);
const messages = {
  invalid_url: [400, 'Gunakan URL HTTPS Pastebin dengan ID 8 karakter.'],
  not_found: [404, 'Paste tidak ditemukan atau sudah dihapus.'],
  non_text: [422, 'Isi paste bukan teks UTF-8.'],
  blocked: [429, 'Pastebin membatasi permintaan. Coba lagi nanti.'],
  too_large: [413, 'Isi paste melebihi 2 MiB.'],
  upstream_error: [502, 'Pastebin belum dapat mengembalikan isi paste.'],
  network_error: [504, 'Waktu tunggu Pastebin habis.'],
};
const fail = (code) => Object.assign(new Error(messages[code][1]), { code });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function allowed(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !HOSTS.has(url.hostname.toLowerCase())) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function parseInput(value) {
  const url = allowed(typeof value === 'string' ? value.trim() : value);
  const id = url?.pathname.match(ID_PATH)?.[1];
  if (!id) throw fail('invalid_url');
  return { id, page: `https://pastebin.com/${id}`, raw: `https://pastebin.com/raw/${id}` };
}

async function open(target, { fetchImpl, signal }) {
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = allowed(current);
    if (!url) throw fail('upstream_error');
    signal.throwIfAborted();
    const response = await fetchImpl(url.href, {
      redirect: 'manual',
      signal,
      headers: { Accept: 'text/plain' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || hop === MAX_REDIRECTS) throw fail('upstream_error');
      current = new URL(location, url).href;
      continue;
    }
    return response;
  }
  throw fail('upstream_error');
}

async function readCapped(response) {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > LIMIT) {
    await response.body?.cancel();
    throw fail('too_large');
  }
  const reader = response.body?.getReader();
  if (!reader) throw fail('upstream_error');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMIT) {
        await reader.cancel();
        throw fail('too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

function decodeText(body) {
  if (body.includes(0)) throw fail('non_text');
  const content = body.toString('utf8');
  const damaged = (content.match(/\uFFFD/g) || []).length;
  if (damaged > Math.max(16, content.length * 0.01)) throw fail('non_text');
  return content;
}

async function getPastebin(input, { fetchImpl = fetch, signal } = {}) {
  const target = typeof input === 'string' ? parseInput(input) : input;
  if (!target || !ID_PATH.test(`/${target.id}`)) throw fail('invalid_url');
  const deadline = AbortSignal.timeout(BUDGET_MS);
  const shared = signal ? AbortSignal.any([signal, deadline]) : deadline;

  for (let attempt = 0; ; attempt++) {
    try {
      const attemptSignal = AbortSignal.any([shared, AbortSignal.timeout(ATTEMPT_MS)]);
      const response = await open(target.raw, { fetchImpl, signal: attemptSignal });
      const contentType = response.headers.get('content-type');
      if (response.headers.get('cf-mitigated') === 'challenge') {
        await response.body?.cancel();
        throw fail('blocked');
      }
      if ([404, 410].includes(response.status)) {
        await response.body?.cancel();
        throw fail('not_found');
      }
      if ([401, 403, 429].includes(response.status)) {
        await response.body?.cancel();
        throw fail('blocked');
      }
      if (response.status !== 200) {
        await response.body?.cancel();
        throw fail('upstream_error');
      }
      if (!/^text\/plain(?:\s*;|$)/i.test(contentType || '')) {
        await response.body?.cancel();
        throw fail('non_text');
      }
      const body = await readCapped(response);
      return {
        id: target.id,
        urls: { page: target.page, raw: target.raw },
        content: decodeText(body),
        bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
        content_type: contentType,
        fetched_at: new Date().toISOString(),
      };
    } catch (error) {
      if (shared.aborted) throw fail('network_error');
      const code = ['TimeoutError', 'AbortError'].includes(error.name) || error instanceof TypeError
        ? 'network_error'
        : Object.hasOwn(messages, error.code) ? error.code : 'upstream_error';
      if (attempt >= 2 || !RETRYABLE.has(code)) throw fail(code);
      await sleep(500 * 2 ** attempt);
    }
  }
}

function errorResponse(error) {
  const code = ['TimeoutError', 'AbortError'].includes(error.name) || error instanceof TypeError
    ? 'network_error'
    : Object.hasOwn(messages, error.code) ? error.code : 'upstream_error';
  const [status, message] = messages[code];
  return { status, body: { success: false, error: { code, message } } };
}

module.exports = { parseInput, getPastebin, errorResponse };

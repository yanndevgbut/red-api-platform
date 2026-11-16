const net = require('node:net');
const BASE = 'https://www.tapdl.com';
const IMAGE_FORMATS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'heic',
  'heif',
]);
const fail = (code, message) => Object.assign(new Error(message), { code });
function normalizeInput(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048)
    throw fail('INVALID_URL', 'URL Instagram tidak valid.');
  let url;
  try {
    url = new URL(input);
  } catch {
    throw fail('INVALID_URL', 'URL Instagram tidak valid.');
  }
  const match = url.pathname.match(
    /^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{1,128})\/?$/,
  );
  if (
    url.protocol !== 'https:' ||
    !['instagram.com', 'www.instagram.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !match
  )
    throw fail(
      'INVALID_URL',
      'Gunakan URL HTTPS postingan atau Reel Instagram.',
    );
  const kind = match[1] === 'reels' ? 'reel' : match[1];
  return {
    shortcode: match[2],
    source: `https://www.instagram.com/${kind}/${match[2]}/`,
  };
}
function mediaURL(input) {
  if (typeof input !== 'string' || input.length > 16384) return null;
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      net.isIP(host) ||
      !host.includes('.') ||
      /\.(localhost|local|internal|lan|test|invalid)$/.test(host) ||
      host.endsWith('.')
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
function parseResult(data, { shortcode, source }) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw fail('INVALID_RESPONSE', 'Respons TapDL tidak valid.');
  if (!Array.isArray(data.items) || !data.items.length)
    throw fail(
      'MEDIA_NOT_FOUND',
      'Media tidak ditemukan. Postingan mungkin privat, dihapus, atau tidak tersedia.',
    );
  if (data.items.length > 100)
    throw fail('INVALID_RESPONSE', 'Jumlah media TapDL melebihi batas.');
  const items = data.items
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const downloads = Array.isArray(item.downloads) ? item.downloads : [];
      if (downloads.length > 100)
        throw fail('INVALID_RESPONSE', 'Pilihan unduhan TapDL melebihi batas.');
      const options = downloads.flatMap((download) => {
        if (!download || typeof download !== 'object') return [];
        const url = mediaURL(download.url);
        if (!url) return [];
        const size = ['number', 'string'].includes(typeof download.size)
          ? Number(download.size)
          : NaN;
        return [
          {
            format:
              typeof download.ext === 'string'
                ? download.ext.toLowerCase()
                : '',
            label:
              typeof download.label === 'string'
                ? download.label.slice(0, 200)
                : '',
            size_bytes:
              Number.isFinite(size) &&
              size > 0 &&
              size <= Number.MAX_SAFE_INTEGER
                ? size
                : null,
            url,
          },
        ];
      });
      const duration = ['number', 'string'].includes(typeof item.duration)
        ? Number(item.duration)
        : NaN;
      return {
        title: typeof item.title === 'string' ? item.title.slice(0, 4000) : '',
        uploader:
          typeof item.uploader === 'string'
            ? item.uploader.slice(0, 500)
            : item.uploader && typeof item.uploader === 'object'
              ? item.uploader
              : null,
        duration_seconds:
          Number.isFinite(duration) && duration > 0 ? duration : null,
        downloads: {
          mp4: options.filter((option) => option.format === 'mp4'),
          mp3: options.filter((option) => option.format === 'mp3'),
          image: options.filter((option) => IMAGE_FORMATS.has(option.format)),
        },
      };
    });
  if (
    !items.some((item) =>
      Object.values(item.downloads).some((options) => options.length),
    )
  )
    throw fail(
      'FORMAT_UNAVAILABLE',
      'Tidak ada gambar, MP4, atau MP3 yang tersedia untuk postingan ini.',
    );
  return { provider: 'tapdl.com', shortcode, source, items };
}
async function readJson(response) {
  if (
    !/^application\/json\b/i.test(response.headers.get('content-type') || '')
  ) {
    await response.body?.cancel();
    throw fail(
      'NON_JSON_RESPONSE',
      `TapDL mengembalikan respons non-JSON (HTTP ${response.status}).`,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw fail('INVALID_RESPONSE', 'Respons TapDL kosong.');
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      throw fail('INVALID_RESPONSE', 'Respons TapDL terlalu besar.');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw fail('INVALID_RESPONSE', 'JSON TapDL tidak valid.');
  }
}
async function scrapeInstagram(input, { fetchImpl = fetch, signal } = {}) {
  const normalized = normalizeInput(input);
  const timeout = AbortSignal.timeout(60000);
  const response = await fetchImpl(`${BASE}/wp-json/svd/v1/fetch`, {
    method: 'POST',
    redirect: 'error',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({
      url: normalized.source,
      lang: 'en',
      tool: 'instagram',
    }),
  });
  if (response.status === 429) {
    await response.body?.cancel();
    throw fail(
      'RATE_LIMITED',
      'Batas permintaan TapDL tercapai. Coba lagi nanti.',
    );
  }
  const data = await readJson(response);
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw fail('INVALID_RESPONSE', 'Respons TapDL tidak valid.');
  if (!response.ok || data.error || data.success === false) {
    const rawCode = data.code || data.error?.code || `HTTP_${response.status}`;
    const message =
      typeof data.error === 'string'
        ? data.error
        : data.error?.message || data.message;
    throw fail(
      typeof rawCode === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(rawCode)
        ? rawCode
        : 'PROVIDER_ERROR',
      typeof message === 'string'
        ? message.slice(0, 300)
        : 'Permintaan TapDL gagal.',
    );
  }
  return parseResult(data, normalized);
}
function errorResponse(error) {
  const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
  const status = timeout
    ? 504
    : error.code === 'RATE_LIMITED'
      ? 429
      : ['MEDIA_NOT_FOUND', 'HTTP_404', 'HTTP_410'].includes(error.code)
        ? 404
        : 502;
  return {
    status,
    body: {
      success: false,
      error: {
        code: timeout
          ? 'PROVIDER_TIMEOUT'
          : typeof error.code === 'string' &&
              /^[A-Za-z0-9_-]{1,64}$/.test(error.code)
            ? error.code
            : 'PROVIDER_ERROR',
        message: timeout
          ? 'Waktu tunggu TapDL habis. Coba lagi nanti.'
          : typeof error.message === 'string'
            ? error.message.slice(0, 300)
            : 'Media Instagram belum dapat diambil.',
      },
    },
  };
}
module.exports = {
  normalizeInput,
  mediaURL,
  parseResult,
  scrapeInstagram,
  errorResponse,
};

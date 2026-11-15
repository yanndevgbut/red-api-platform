const { setTimeout: delay } = require('node:timers/promises');
const BASE = 'https://tubdown.com';
const fail = (code, message) => Object.assign(new Error(message), { code });
function videoId(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048)
    throw fail('INVALID_URL', 'URL tidak valid.');
  let url;
  try {
    url = new URL(input);
  } catch {
    throw fail('INVALID_URL', 'URL tidak valid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw fail('INVALID_URL', 'Gunakan URL HTTPS YouTube.');
  let id;
  if (url.hostname === 'youtu.be')
    id = url.pathname.slice(1).replace(/\/$/, '');
  else if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
  ) {
    id =
      url.pathname === '/watch' && url.searchParams.getAll('v').length === 1
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/)?.[1];
  }
  if (!/^[\w-]{11}$/.test(id || ''))
    throw fail('INVALID_URL', 'ID video YouTube tidak valid.');
  return id;
}
function validateQuality(quality) {
  if (!Number.isInteger(quality) || quality < 1 || quality > 4320)
    throw fail(
      'INVALID_QUALITY',
      'Resolusi harus berupa angka bulat antara 1 dan 4320.',
    );
  return quality;
}
async function readJson(response) {
  if (
    !/^application\/json\b/i.test(response.headers.get('content-type') || '')
  ) {
    await response.body?.cancel();
    throw fail(
      'NON_JSON_RESPONSE',
      `Respons Tubdown bukan JSON (HTTP ${response.status}).`,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw fail('INVALID_RESPONSE', 'Respons Tubdown kosong.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024 * 1024) {
      await reader.cancel();
      throw fail('INVALID_RESPONSE', 'Respons Tubdown terlalu besar.');
    }
    chunks.push(value);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
    return data;
  } catch {
    throw fail('INVALID_RESPONSE', 'JSON Tubdown tidak valid.');
  }
}
function providerError(code, message) {
  return fail(
    typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)
      ? code
      : 'CONVERSION_FAILED',
    typeof message === 'string'
      ? message.slice(0, 300)
      : 'Konversi Tubdown gagal.',
  );
}
async function scrapeYouTube(
  input,
  {
    quality = 720,
    timeoutMs = 180000,
    signal,
    fetchImpl = fetch,
    delayImpl = delay,
  } = {},
) {
  const id = videoId(input);
  validateQuality(quality);
  const deadline = AbortSignal.timeout(timeoutMs);
  const total = signal ? AbortSignal.any([signal, deadline]) : deadline;
  async function api(path, body) {
    const response = await fetchImpl(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      signal: AbortSignal.any([total, AbortSignal.timeout(30000)]),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: BASE,
        Referer: `${BASE}/`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 429) {
      await response.body?.cancel();
      throw fail(
        'RATE_LIMITED',
        'Batas permintaan Tubdown tercapai. Coba lagi nanti.',
      );
    }
    const data = await readJson(response);
    if (!response.ok || data.error)
      throw providerError(
        data.error?.code || `HTTP_${response.status}`,
        typeof data.error === 'string'
          ? data.error
          : data.error?.message || 'Permintaan Tubdown gagal.',
      );
    return data;
  }
  const source = `https://www.youtube.com/watch?v=${id}`;
  const { info } = await api('/api/info', { url: source });
  if (
    !info ||
    info.id !== id ||
    !Array.isArray(info.video) ||
    !Array.isArray(info.audio)
  )
    throw fail('INVALID_RESPONSE', 'Metadata video tidak sesuai.');
  const videos = info.video
    .filter(
      (item) =>
        item &&
        String(item.format).toUpperCase() === 'MP4' &&
        Number.isInteger(Number(item.quality)) &&
        Number(item.quality) > 0,
    )
    .sort((a, b) => Number(b.quality) - Number(a.quality));
  const selectedVideo =
    videos.find((item) => Number(item.quality) <= quality) || videos.at(-1);
  const selectedAudio = info.audio.find(
    (item) =>
      item &&
      String(item.format).toUpperCase() === 'MP3' &&
      (typeof item.quality === 'string'
        ? /^[a-z0-9_-]{1,32}$/i.test(item.quality)
        : Number.isFinite(item.quality)),
  );
  if (!selectedVideo || !selectedAudio)
    throw fail(
      'FORMAT_UNAVAILABLE',
      'MP4 dan MP3 tidak tersedia lengkap untuk video ini.',
    );
  async function convert(type, option) {
    let { job } = await api('/api/jobs', { id, type, quality: option.quality });
    if (
      !job ||
      typeof job.id !== 'string' ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(job.id)
    )
      throw fail('INVALID_JOB', 'ID konversi tidak valid.');
    const jobId = job.id;
    for (let polls = 0; job.status !== 'ready'; polls++) {
      if (job.status === 'error') throw providerError(job.errorCode, job.error);
      if (
        typeof job.status !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,63}$/i.test(job.status) ||
        polls >= 90
      )
        throw fail(
          'INVALID_JOB',
          'Status konversi tidak valid atau melewati batas polling.',
        );
      await delayImpl(2000, undefined, { signal: total });
      ({ job } = await api(`/api/jobs/${jobId}`));
      if (!job || job.id !== jobId)
        throw fail('INVALID_JOB', 'Respons konversi tidak sesuai.');
    }
    return {
      format: type === 'video' ? 'mp4' : 'mp3',
      quality:
        typeof option.label === 'string'
          ? option.label.slice(0, 100)
          : String(option.quality),
      size_bytes: Number.isFinite(job.size) && job.size >= 0 ? job.size : null,
      filename:
        typeof job.fileName === 'string' ? job.fileName.slice(0, 500) : null,
      url: `${BASE}/api/jobs/${jobId}/file`,
    };
  }
  const mp4 = await convert('video', selectedVideo);
  const mp3 = await convert('audio', selectedAudio);
  return {
    provider: 'tubdown.com',
    id,
    title: typeof info.title === 'string' ? info.title.slice(0, 4000) : '',
    author: typeof info.author === 'string' ? info.author.slice(0, 500) : '',
    duration_seconds: Number.isFinite(info.duration) ? info.duration : null,
    source,
    downloads: { mp4, mp3 },
  };
}
module.exports = { scrapeYouTube, videoId, validateQuality };

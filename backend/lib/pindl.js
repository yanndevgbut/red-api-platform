const { load } = require('cheerio');
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_BYTES = 5 * 1024 * 1024;

function validate(input, media = false) {
  if (
    (typeof input !== 'string' && !(input instanceof URL)) ||
    String(input).length > (media ? 16384 : 2048)
  )
    throw new TypeError('URL tidak diizinkan.');
  const url = new URL(input);
  const allowed = media
    ? /(^|\.)pinimg\.com$/i.test(url.hostname)
    : /^(pin\.it|(?:www\.|id\.)?pinterest\.com|api\.pinterest\.com)$/i.test(
        url.hostname,
      );
  if (
    !allowed ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port
  )
    throw new TypeError('URL tidak diizinkan.');
  return url;
}
function isPinterestUrl(input) {
  try {
    if (typeof input !== 'string' || !input.trim()) return false;
    const url = validate(input);
    return url.hostname === 'pin.it'
      ? /^\/[^/]+\/?$/.test(url.pathname)
      : /^\/pin\/\d+(\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}
async function readHtml(response) {
  if (
    !/^(text\/html|application\/xhtml\+xml)\b/i.test(
      response.headers.get('content-type') || '',
    )
  ) {
    await response.body?.cancel();
    throw new Error('Respons Pinterest bukan HTML.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Respons Pinterest kosong.');
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('Respons Pinterest terlalu besar.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function getPage(input, { fetchImpl, signal }) {
  let url = validate(input);
  for (let i = 0; i < 9; i++) {
    const response = await fetchImpl(url, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirect tanpa URL tujuan.');
      url = validate(new URL(location, url));
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error(
        `Pinterest mengembalikan HTTP ${response.status}.`,
      );
      if (response.status === 404 || response.status === 410)
        error.name = 'PinNotFoundError';
      throw error;
    }
    return { url, html: await readHtml(response) };
  }
  throw new Error('Terlalu banyak redirect.');
}
function walk(value, visit, budget = { left: 100000 }) {
  const stack = [value];
  while (stack.length) {
    const object = stack.pop();
    if (!object || typeof object !== 'object') continue;
    if (--budget.left < 0) throw new Error('Data Pinterest terlalu kompleks.');
    visit(object);
    for (const child of Object.values(object))
      if (child && typeof child === 'object') stack.push(child);
  }
}
function parsePinterest(html, input) {
  const page = validate(input);
  const id = page.pathname.match(/^\/pin\/(\d+)(?:\/|$)/)?.[1];
  if (!id) throw new Error('URL tidak menuju sebuah pin.');
  const $ = load(html);
  const meta = Object.create(null);
  $('meta').each((_index, element) => {
    const key = $(element).attr('property') || $(element).attr('name');
    const value = $(element).attr('content');
    if (key && value) meta[key.toLowerCase()] ??= value;
  });
  const budget = { left: 100000 };
  const videos = [];
  let isVideo = /video/i.test(meta['og:type'] || '');
  function addVideo(value, area = 0) {
    if (typeof value !== 'string' || !/\.(mp4|m3u8)(?:\?|$)/i.test(value))
      return;
    try {
      const url = validate(value, true);
      if (videos.length < 256)
        videos.push({ url: url.href, area: Number.isFinite(area) ? area : 0 });
    } catch {
      /* Ignore unrelated or unsafe media candidates. */
    }
  }
  $('script').each((_index, element) => {
    const attrs = `${$(element).attr('type') || ''} ${$(element).attr('id') || ''}`;
    if (!/json|__PWS_DATA__|__NEXT_DATA__/i.test(attrs)) return;
    let data;
    try {
      data = JSON.parse($(element).html());
    } catch {
      return;
    }
    walk(
      data,
      (object) => {
        if (
          String(object.id) === id &&
          (object.videos || object.story_pin_data)
        ) {
          isVideo = true;
          walk(
            [object.videos, object.story_pin_data],
            (item) =>
              addVideo(
                item.url,
                Number(item.width || 0) * Number(item.height || 0),
              ),
            budget,
          );
        }
        if ([].concat(object['@type'] || []).includes('VideoObject')) {
          const reference = String(object.url || object['@id'] || '').match(
            /\/pin\/(\d+)/,
          )?.[1];
          if (reference && reference !== id) return;
          isVideo = true;
          addVideo(object.contentUrl);
        }
      },
      budget,
    );
  });
  videos.sort(
    (a, b) =>
      Number(/\.mp4(?:\?|$)/i.test(b.url)) -
        Number(/\.mp4(?:\?|$)/i.test(a.url)) || b.area - a.area,
  );
  const video =
    videos[0]?.url ||
    meta['og:video:secure_url'] ||
    meta['og:video:url'] ||
    meta['og:video'];
  if (!video && isVideo) throw new Error('URL video tidak tersedia.');
  const media = video || meta['og:image:secure_url'] || meta['og:image'];
  if (!media) throw new Error('Media publik tidak ditemukan.');
  const mediaURL = validate(media, true);
  const format = mediaURL.pathname.split('.').pop().toLowerCase();
  if (
    !(
      video ? ['mp4', 'm3u8'] : ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']
    ).includes(format)
  )
    throw new Error('Format media tidak didukung.');
  return {
    id,
    title: (meta['og:title'] || '').slice(0, 4000),
    type: video ? 'video' : 'image',
    format,
    url: mediaURL.href,
    source: `https://www.pinterest.com/pin/${id}/`,
  };
}
async function scrapePinterest(
  input,
  { fetchImpl = fetch, signal = AbortSignal.timeout(20000) } = {},
) {
  if (!isPinterestUrl(input))
    throw new TypeError('Gunakan URL pin.it atau pinterest.com/pin/ID/.');
  const { url, html } = await getPage(input, { fetchImpl, signal });
  return parsePinterest(html, url);
}
module.exports = { scrapePinterest, parsePinterest, isPinterestUrl, validate };

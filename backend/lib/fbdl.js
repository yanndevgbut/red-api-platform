const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const pageHosts = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'fb.watch',
]);
const fail = (code, message) => Object.assign(new Error(message), { code });
const entities = (text) =>
  text.replace(
    /&#(?:x([a-f0-9]+)|(\d+));|&(?:quot|amp|apos|lt|gt);/gi,
    (token, hex, decimal) => {
      if (!hex && !decimal)
        return {
          '&quot;': '"',
          '&amp;': '&',
          '&apos;': "'",
          '&lt;': '<',
          '&gt;': '>',
        }[token.toLowerCase()];
      const value = hex ? parseInt(hex, 16) : Number(decimal);
      return value <= 0x10ffff ? String.fromCodePoint(value) : token;
    },
  );

function validate(value) {
  const invalid = () =>
    fail('INVALID_URL', 'Gunakan URL HTTPS Facebook atau fb.watch yang valid.');
  if (typeof value !== 'string' || value.length > 2048) throw invalid();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if (
    url.protocol !== 'https:' ||
    !pageHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw invalid();
  url.hash = '';
  return url;
}

async function page(value, { fetchImpl, signal }) {
  let url = validate(value);
  for (let hop = 0; hop < 6; hop++) {
    signal.throwIfAborted();
    const response = await fetchImpl(url.href, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location)
        throw fail(
          'FACEBOOK_RESPONSE',
          'Redirect Facebook tidak memiliki tujuan.',
        );
      try {
        url = validate(new URL(location, url).href);
      } catch {
        throw fail(
          'FACEBOOK_RESPONSE',
          'Facebook mengalihkan ke alamat yang tidak diizinkan.',
        );
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429)
        throw fail(
          'RATE_LIMITED',
          'Facebook membatasi permintaan. Coba lagi nanti.',
        );
      if ([401, 403].includes(response.status))
        throw fail('FACEBOOK_RESTRICTED', 'Media tidak tersedia tanpa login.');
      if ([404, 410].includes(response.status))
        throw fail('MEDIA_UNAVAILABLE', 'Media tidak tersedia tanpa login.');
      throw fail(
        'FACEBOOK_RESPONSE',
        'Facebook mengembalikan HTTP ' + response.status + '.',
      );
    }
    if (/^\/(?:login(?:\.php)?|checkpoint)(?:\/|$)/i.test(url.pathname)) {
      await response.body?.cancel();
      throw fail('MEDIA_UNAVAILABLE', 'Media tidak tersedia tanpa login.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw fail('FACEBOOK_RESPONSE', 'Respons Facebook kosong.');
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        size += chunk.length;
        if (size > 12 * 1024 * 1024) {
          await reader.cancel();
          throw fail('FACEBOOK_RESPONSE', 'HTML Facebook melebihi 12 MiB.');
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    return { html: Buffer.concat(chunks).toString('utf8'), url };
  }
  throw fail('FACEBOOK_RESPONSE', 'Terlalu banyak redirect Facebook.');
}

function mediaURL(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname.endsWith('.fbcdn.net') ||
        url.hostname.endsWith('.facebook.com') ||
        url.hostname === 'lookaside.fbsbx.com')
    )
      return url.href;
  } catch {}
  return null;
}

function extract(html, { photoId = null } = {}) {
  const strings = (key) => {
    const re = new RegExp('"' + key + '"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")', 'g');
    const values = [];
    for (const match of html.matchAll(re)) {
      try {
        values.push(JSON.parse(match[1]));
      } catch {}
      if (values.length >= 64) break;
    }
    return values;
  };
  const meta = (name) => {
    for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
      const attrs = Object.fromEntries(
        [...tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map((m) => [
          m[1].toLowerCase(),
          entities(m[3]),
        ]),
      );
      if ((attrs.property || attrs.name) === name) return attrs.content || null;
    }
    return null;
  };
  const media = [];
  const seen = new Set();
  function add(type, quality, url) {
    if (media.length >= 32) return;
    const href = mediaURL(url);
    if (!href || seen.has(href)) return;
    seen.add(href);
    media.push({ type, quality, url: href });
  }
  if (!photoId) {
    for (const [key, quality] of [
      ['hd_src', 'HD'],
      ['hd_src_no_ratelimit', 'HD'],
      ['sd_src', 'SD'],
      ['sd_src_no_ratelimit', 'SD'],
      ['browser_native_hd_url', 'HD'],
      ['browser_native_sd_url', 'SD'],
      ['playable_url_quality_hd', 'HD'],
      ['playable_url', 'unknown'],
    ]) {
      for (const url of strings(key)) add('video', quality, url);
    }
    for (const key of ['og:video', 'og:video:url', 'og:video:secure_url'])
      add('video', 'unknown', meta(key));
  }
  const image = mediaURL(meta('og:image'));
  if (photoId) {
    const visit = (node, depth = 0) => {
      if (depth > 64 || !node || typeof node !== 'object') return;
      if (String(node.id) === photoId && node.image?.uri) {
        add('image', 'source', node.image.uri);
        const item = media.find((m) => m.url === mediaURL(node.image.uri));
        const dimension = (value) =>
          Number.isSafeInteger(value) && value > 0 ? value : null;
        if (item)
          Object.assign(item, {
            width: dimension(node.image.width),
            height: dimension(node.image.height),
          });
      }
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object') visit(value, depth + 1);
      }
    };
    for (const script of html.matchAll(
      /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        visit(JSON.parse(script[1]));
      } catch {}
    }
  }
  return {
    title: meta('og:title'),
    description: meta('og:description'),
    thumbnail: image,
    media,
    canonical: meta('og:url'),
  };
}

function metadata(html, targetId) {
  const result = {
    id: targetId || null,
    creator: { id: null, name: null, url: null },
    caption: null,
    published_at: null,
    duration_seconds: null,
    accessibility_caption: null,
    engagement: { reactions: null, comments: null, shares: null, views: null },
  };
  const targets = [];
  const scan = (value, depth = 0) => {
    if (depth > 64 || !value || typeof value !== 'object') return;
    if (targetId && String(value.id) === targetId) targets.push(value);
    for (const child of Object.values(value))
      if (child && typeof child === 'object') scan(child, depth + 1);
  };
  for (const script of html.matchAll(
    /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      scan(JSON.parse(script[1]));
    } catch {}
  }
  const count = (value) =>
    Number.isFinite(value)
      ? value
      : Number.isFinite(value?.count)
        ? value.count
        : null;
  const inspect = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 18) return;
    for (const person of [
      value.owner,
      ...(Array.isArray(value.actors) ? value.actors : []),
    ]) {
      if (!/^\d{1,24}$/.test(String(person?.id ?? ''))) continue;
      if (!result.creator.id || result.creator.id === String(person.id)) {
        result.creator.id = String(person.id);
        result.creator.name ||=
          typeof person.name === 'string' ? person.name : null;
        try {
          result.creator.url ||= validate(person.url).href;
        } catch {}
      }
    }
    if (typeof value.message?.text === 'string' && value.message.text.trim())
      result.caption ||= value.message.text;
    const timestamp =
      value.publish_time || value.created_time || value.creation_time;
    if (
      !result.published_at &&
      Number.isFinite(timestamp) &&
      timestamp > 0 &&
      timestamp <= 8640000000000
    )
      result.published_at = new Date(timestamp * 1000).toISOString();
    if (
      !result.duration_seconds &&
      Number.isFinite(value.playable_duration_in_ms)
    )
      result.duration_seconds = value.playable_duration_in_ms / 1000;
    if (typeof value.accessibility_caption === 'string')
      result.accessibility_caption ||= value.accessibility_caption;
    for (const [field, keys] of Object.entries({
      reactions: ['reaction_count'],
      comments: ['comment_count', 'total_comment_count'],
      shares: ['share_count'],
      views: ['video_view_count', 'play_count'],
    })) {
      for (const key of keys) {
        if (field === 'reactions' && typeof value[key] !== 'object') continue;
        const n = count(value[key]);
        if (result.engagement[field] === null && n !== null)
          result.engagement[field] = n;
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (
        [
          'owner',
          'actors',
          'top_reactions',
          'recommendations',
          'related_videos',
          'edges',
        ].includes(key)
      )
        continue;
      if (child && typeof child === 'object') inspect(child, depth + 1);
    }
  };
  for (const target of targets) inspect(target);
  if (!result.creator.url && result.creator.id)
    result.creator.url = `https://www.facebook.com/${result.creator.id}`;
  return result;
}

function identify(url) {
  const numeric = (value) => (/^\d{1,24}$/.test(value || '') ? value : null);
  const photoId =
    numeric(url.searchParams.get('fbid')) ||
    url.pathname.match(/\/photos\/(?:[^/]+\/)?(\d{1,24})(?:\/|$)/)?.[1] ||
    null;
  const id =
    photoId ||
    numeric(url.searchParams.get('v')) ||
    url.pathname.match(
      /\/(?:videos|reel)\/(?:[^/]+\/)?(\d{1,24})(?:\/|$)/i,
    )?.[1] ||
    null;
  return {
    id,
    type: photoId ? 'photo' : /\/reel\//i.test(url.pathname) ? 'reel' : 'video',
  };
}

async function scrape(input, { fetchImpl = fetch, signal } = {}) {
  const original = validate(input);
  const timeout = AbortSignal.timeout(20000);
  const options = {
    fetchImpl,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  };
  let identity = identify(original);
  const candidates = [];
  const localized = new URL(original);
  localized.searchParams.set('locale', 'en_US');
  if (identity.id && identity.type !== 'photo') {
    candidates.push(
      'https://www.facebook.com/video/embed?video_id=' + identity.id,
    );
  }
  candidates.push(localized.href);
  if (identity.type !== 'photo') {
    const plugin = new URL('https://www.facebook.com/plugins/video.php');
    plugin.searchParams.set('href', original.href);
    if (plugin.href.length <= 2048) candidates.push(plugin.href);
  }
  let lastError;
  let previousResult;
  let resolved = original.href;
  for (const candidate of candidates) {
    try {
      const response = await page(candidate, options);
      if (candidate === localized.href) {
        resolved = response.url.href;
        const redirected = identify(response.url);
        if (!identity.id && redirected.id) identity = redirected;
      }
      const parsed = extract(response.html, {
        photoId: identity.type === 'photo' ? identity.id : null,
      });
      if (parsed.canonical && identity.id) {
        let canonical;
        try {
          canonical = identify(validate(parsed.canonical));
        } catch {}
        if (canonical?.id && canonical.id !== identity.id) {
          throw fail(
            'MEDIA_UNAVAILABLE',
            'Halaman Facebook tidak cocok dengan media yang diminta.',
          );
        }
        if (
          identity.type === 'photo' &&
          canonical?.id === identity.id &&
          !parsed.media.length &&
          parsed.thumbnail
        ) {
          parsed.media.push({
            type: 'image',
            quality: 'source',
            url: parsed.thumbnail,
          });
        }
      }
      if (!parsed.media.length) {
        previousResult = parsed;
        lastError = fail(
          'MEDIA_UNAVAILABLE',
          'Media publik tidak ditemukan atau memerlukan login.',
        );
        continue;
      }
      let details = metadata(response.html, identity.id);
      if (candidate !== localized.href && identity.id) {
        try {
          const detailSignal = AbortSignal.any([
            options.signal,
            AbortSignal.timeout(3000),
          ]);
          const detailPage = await page(localized.href, {
            fetchImpl,
            signal: detailSignal,
          });
          const detailIdentity = identify(detailPage.url);
          if (detailIdentity.id === identity.id) {
            resolved = detailPage.url.href;
            previousResult = extract(detailPage.html, {
              photoId: identity.type === 'photo' ? identity.id : null,
            });
            const richerDetails = metadata(detailPage.html, identity.id);
            if (
              richerDetails.creator.id ||
              richerDetails.caption ||
              richerDetails.published_at ||
              richerDetails.duration_seconds ||
              Object.values(richerDetails.engagement).some(
                (value) => value !== null,
              )
            )
              details = richerDetails;
          }
        } catch {
          signal?.throwIfAborted();
        }
      }
      return {
        type: identity.type,
        input_url: original.href,
        resolved_url: resolved,
        extraction_url: response.url.href,
        fetched_at: new Date().toISOString(),
        title: parsed.title || previousResult?.title || null,
        description: parsed.description || previousResult?.description || null,
        metadata: details,
        thumbnail: parsed.thumbnail || previousResult?.thumbnail || null,
        media: parsed.media,
        notes: ['URL CDN dapat kedaluwarsa.'],
      };
    } catch (error) {
      if (options.signal.aborted) throw options.signal.reason;
      if (['RATE_LIMITED', 'FACEBOOK_RESTRICTED'].includes(error.code)) throw error;
      lastError = error;
    }
  }
  throw lastError || fail('MEDIA_UNAVAILABLE', 'Media publik tidak ditemukan.');
}

function errorResponse(error) {
  const messages = {
    INVALID_URL: [400, 'Gunakan URL HTTPS Facebook atau fb.watch yang valid.'],
    MEDIA_UNAVAILABLE: [
      404,
      'Media publik tidak ditemukan atau memerlukan login.',
    ],
    FACEBOOK_RESTRICTED: [404, 'Media tidak tersedia tanpa login.'],
    RATE_LIMITED: [429, 'Facebook membatasi permintaan. Coba lagi nanti.'],
    FACEBOOK_TIMEOUT: [504, 'Waktu tunggu Facebook habis.'],
    FACEBOOK_RESPONSE: [
      502,
      'Facebook belum dapat mengembalikan media. Coba lagi nanti.',
    ],
  };
  const code = ['TimeoutError', 'AbortError'].includes(error.name)
    ? 'FACEBOOK_TIMEOUT'
    : Object.hasOwn(messages, error.code)
      ? error.code
      : 'FACEBOOK_RESPONSE';
  const [status, message] = messages[code];
  return { status, body: { success: false, error: { code, message } } };
}

module.exports = { validate, scrape, extract, errorResponse };

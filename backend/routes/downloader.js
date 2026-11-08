const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const { isWebUrl, validateInput } = require('../middleware/validate');
const { load } = require('cheerio');

const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

async function scrapeTikTok(tiktokUrl) {
  // 1. Dapatkan form token dan cookies dari musicaldown
  const signal = AbortSignal.timeout(15000);
  const res1 = await fetch('https://musicaldown.com/id', {
    signal,
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://musicaldown.com/',
    },
  });

  if (!res1.ok) {
    await res1.body?.cancel();
    throw new Error('Layanan pengunduh sedang tidak tersedia.');
  }
  const html1 = await res1.text();
  const $1 = load(html1);

  const rawCookies = res1.headers.getSetCookie ? res1.headers.getSetCookie() : [];
  const cookies = rawCookies.map((v) => v.split(';')[0]).join('; ');

  const inputs = {};
  $1('form input').each((_, el) => {
    const name = $1(el).attr('name');
    if (name) inputs[name] = $1(el).attr('value') || '';
  });

  const keys = Object.keys(inputs);
  if (!keys.length) {
    throw new Error('Gagal mendapatkan token formulir downloader');
  }

  inputs[keys[0]] = tiktokUrl;
  const body = new URLSearchParams(inputs).toString();

  // 2. Kirim POST download request
  const res2 = await fetch('https://musicaldown.com/id/download', {
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://musicaldown.com/id',
      'Origin': 'https://musicaldown.com',
      'Cookie': cookies,
    },
    body,
  });

  if (!res2.ok) {
    await res2.body?.cancel();
    throw new Error('Layanan pengunduh sedang tidak tersedia.');
  }
  const html2 = await res2.text();
  const $2 = load(html2);

  const fastdl = (u) => typeof u === 'string' && u.startsWith('https://fastdl');
  const slideImage = (u) => {
    try {
      const part = u.split('/images/')[1];
      if (!part) return false;
      const decoded = Buffer.from(part, 'base64').toString();
      return decoded.includes('photomode') || decoded.includes('photo-mode');
    } catch {
      return false;
    }
  };

  const result = {
    type: 'video',
    title: $2('.video-desc, .card-title, h2.white-text').text().trim() || null,
    mp4: null,
    mp4_hd: null,
    mp4_wm: null,
    mp3: null,
    audio: null,
    images: [],
  };

  $2('a[href]').each((_, el) => {
    const href = $2(el).attr('href');
    if (!fastdl(href)) return;
    const text = $2(el).text().trim();

    if (text === 'Download MP4 [HD]') {
      result.mp4_hd = href;
    } else if (text === 'Download MP4 [Watermark]') {
      result.mp4_wm = href;
    } else if (text === 'Download MP4') {
      result.mp4 = href;
    } else if (text === 'Download MP3') {
      result.mp3 = href;
    }
  });

  if (!result.mp3) {
    $2('a[href], audio[src], source[src]').each((_, el) => {
      const href = $2(el).attr('href') || $2(el).attr('src') || '';
      if (!fastdl(href)) return;
      const text = $2(el).text().trim().toLowerCase();
      const lower = href.toLowerCase();
      if (text.includes('mp3') || text.includes('audio') || lower.includes('.mp3') || lower.includes('audio')) {
        result.mp3 = href;
      }
    });
  }

  $2('img').each((_, el) => {
    const src = $2(el).attr('src');
    if (!fastdl(src) || !slideImage(src)) return;
    if (!result.images.includes(src)) {
      result.images.push(src);
    }
  });

  if (result.images.length > 0) {
    result.type = 'slide';
    result.audio = result.mp3;
  } else {
    result.type = 'video';
    result.audio = result.mp3;
  }

  if (!result.mp4 && !result.mp4_hd && result.images.length === 0) {
    if (html2.includes('105') || html2.includes('pribadi')) {
      throw new Error('Video TikTok bersifat pribadi, telah dihapus, atau tautan tidak valid.');
    }
    throw new Error('Gagal mengekstrak streaming link dari video TikTok.');
  }

  return result;
}

// GET /api/download/tiktok?url=...
router.get('/tiktok', validateInput(req => req.query, {
  url: value => isWebUrl(value, 'tiktok.com')
}), authorize(), async (req, res) => {
  const { url } = req.apiInput;
  try {
    const data = await scrapeTikTok(url);
    res.json({
      status: true,
      creator: 'RED/API Engine',
      user_plan: req.apiUser.plan,
      quota_remaining: req.apiUser.remaining,
      result: data
    });
  } catch (err) {
    const status = err.name === 'TimeoutError' ? 504 : 502;
    res.status(status).json({
      status: false,
      code: status,
      message: status === 504 ? 'Downloader timed out.' : 'Failed to download TikTok media.'
    });
  }
});

// GET /api/download/instagram?url=...
router.get('/instagram', validateInput(req => req.query, {
  url: value => isWebUrl(value, 'instagram.com')
}), authorize('basic'), (req, res) => {
  res.json({
    status: true,
    creator: 'RED/API Engine',
    user_plan: req.apiUser.plan,
    quota_remaining: req.apiUser.remaining,
    simulated: true,
    result: {
      type: 'reels',
      shortcode: 'DF123xyz',
      media_url: `https://cdn.redapi.dev/stream/ig_${Date.now()}.mp4`,
      caption: 'Exclusive media extracted successfully.'
    }
  });
});

module.exports = router;

const { scrapeYouTube, videoId, validateQuality } = require('./ytdl');
function readInput(query) {
  const url = query.url;
  videoId(url);
  const raw = query.quality === '' ? undefined : query.quality;
  if (raw !== undefined && (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw)))
    throw Object.assign(
      new Error('Resolusi harus berupa angka bulat antara 1 dan 4320.'),
      { code: 'INVALID_QUALITY' },
    );
  return {
    url,
    quality: validateQuality(raw === undefined ? 720 : Number(raw)),
  };
}
function errorResponse(error) {
  if (['TimeoutError', 'AbortError'].includes(error.name))
    return {
      status: 504,
      body: {
        success: false,
        error: {
          code: 'CONVERSION_TIMEOUT',
          message:
            'Waktu tunggu konversi YouTube habis. Coba lagi nanti.',
        },
      },
    };
  const allowed = [
    'RATE_LIMITED',
    'FORMAT_UNAVAILABLE',
    'INVALID_RESPONSE',
    'INVALID_JOB',
    'NON_JSON_RESPONSE',
    'CONVERSION_FAILED',
    'HTTP_400',
    'HTTP_403',
    'HTTP_404',
    'HTTP_500',
    'VIDEO_UNAVAILABLE',
    'VIDEO_TOO_LONG',
    'LIVE_NOT_SUPPORTED',
  ];
  return {
    status: error.code === 'RATE_LIMITED' ? 429 : 502,
    body: {
      success: false,
      error: {
        code: allowed.includes(error.code) ? error.code : 'CONVERSION_FAILED',
        message:
          typeof error.message === 'string'
            ? error.message.slice(0, 300)
            : 'Konversi YouTube gagal.',
      },
    },
  };
}
// Bound simultaneous remote conversions; rejected requests do not spend quota.
function conversionSlots(max = 2) {
  let active = 0;
  return (req, res, next) => {
    if (active >= max) {
      res.set('Retry-After', '10');
      return res
        .status(503)
        .json({
          success: false,
          error: {
            code: 'SERVER_BUSY',
            message: 'Konversi sedang penuh. Coba lagi sebentar.',
          },
        });
    }
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}
function createHandler({scrape=scrapeYouTube,heartbeatMs=10000}={}) {
  return require('./json-response').createJsonHandler({work:(req,signal)=>scrape(req.ytdlInput.url,{quality:req.ytdlInput.quality,signal}),mapError:errorResponse,heartbeatMs});
}

module.exports = { readInput, conversionSlots, createHandler };

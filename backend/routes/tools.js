const express = require('express');
const supabase = require('../config/supabase');
const authentication = require('../middleware/auth');
const { ensureEntitlement } = require('../lib/billing');
const { ready: available } = require('../lib/ssweb-runtime');
const { screenshotWeb, readInput } = require('../lib/ssweb');
const { resolvePublic } = require('../lib/ssweb-egress');
const { createJsonHandler } = require('../lib/json-response');
const router = express.Router();
const authorize =
  typeof authentication.authorize === 'function'
    ? authentication.authorize()
    : authentication;
let active = 0;
const reject = (res, status, code, message) =>
  res.status(status).json({ success: false, error: { code, message } });
router.get(
  '/ssweb',
  (req, res, next) => {
    try {
      req.screenshotInput = readInput(req.query);
    } catch (error) {
      return reject(
        res,
        400,
        error.code || 'INVALID_URL',
        error.code === 'BLOCKED_TARGET'
          ? 'Gunakan URL HTTP/HTTPS publik tanpa kredensial atau port khusus.'
          : error.message,
      );
    }
    const key = req.get('x-api-key') || req.query.apikey;
    if (
      req.query.apikey !== undefined &&
      (typeof req.query.apikey !== 'string' ||
        (req.get('x-api-key') && req.query.apikey !== req.get('x-api-key')))
    )
      return reject(
        res,
        401,
        'INVALID_KEY',
        'Gunakan satu API key yang valid.',
      );
    if (
      typeof key !== 'string' ||
      key.length > 128 ||
      !/^[a-z0-9_-]+$/i.test(key)
    )
      return reject(
        res,
        401,
        'INVALID_KEY',
        'API key diperlukan melalui header x-api-key.',
      );
    req.screenshotKey = key;
    next();
  },
  async (req, res, next) => {
    try {
      const result = await supabase
        .from('api_keys')
        .select('user_id')
        .eq('key', req.screenshotKey)
        .eq('is_active', true)
        .maybeSingle();
      if (res.destroyed || res.writableEnded) return;
      if (result.error)
        return reject(
          res,
          503,
          'AUTH_UNAVAILABLE',
          'Autentikasi belum tersedia.',
        );
      if (!result.data)
        return reject(
          res,
          401,
          'INVALID_KEY',
          'API key tidak valid atau sudah dicabut.',
        );
      const profile = await supabase
        .from('profiles')
        .select('banned')
        .eq('id', result.data.user_id)
        .maybeSingle();
      if (res.destroyed || res.writableEnded) return;
      if (profile.error)
        return reject(
          res,
          503,
          'AUTH_UNAVAILABLE',
          'Status akun belum dapat diverifikasi.',
        );
      if (!profile.data || profile.data.banned !== false)
        return reject(res, 403, 'ACCOUNT_BLOCKED', 'Akun tidak aktif.');
      if (!available())
        return reject(
          res,
          503,
          'BROWSER_UNAVAILABLE',
          'Runtime screenshot sedang disiapkan. Coba lagi sebentar.',
        );
      if (res.destroyed || res.writableEnded) return;
      if (active >= 1) {
        res.set('Retry-After', '10');
        return reject(
          res,
          503,
          'SCREENSHOT_BUSY',
          'Screenshot sedang diproses. Coba lagi sebentar.',
        );
      }
      active++;
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          active--;
        }
      };
      req.screenshotRelease = release;
      const releaseBeforeCapture = () => {
        if (!req.screenshotStarted) release();
      };
      res.once('finish', releaseBeforeCapture);
      res.once('close', releaseBeforeCapture);
      await resolvePublic(new URL(req.screenshotInput.url).hostname);
      await ensureEntitlement(result.data.user_id);
      if (res.destroyed) return;
      next();
    } catch (error) {
      return reject(
        res,
        error.code === 'BLOCKED_TARGET' ? 400 : 502,
        error.code === 'BLOCKED_TARGET'
          ? 'BLOCKED_TARGET'
          : 'TARGET_UNAVAILABLE',
        error.code === 'BLOCKED_TARGET'
          ? 'Akses jaringan privat diblokir.'
          : 'Alamat website belum dapat diakses.',
      );
    }
  },
  authorize,
  createJsonHandler({
    work: (req, signal) => {
      req.screenshotStarted = true;
      return screenshotWeb(req.screenshotInput.url, req.screenshotInput, {
        signal,
      }).finally(() => req.screenshotRelease());
    },
    mapError: (error) => ({
      status:
        error.code === 'BLOCKED_TARGET'
          ? 400
          : error.code === 'SCREENSHOT_TIMEOUT'
            ? 504
            : error.code === 'BROWSER_UNAVAILABLE'
              ? 503
              : 502,
      body: {
        success: false,
        error: {
          code:
            typeof error.code === 'string' ? error.code : 'SCREENSHOT_FAILED',
          message: error.message || 'Screenshot gagal dibuat.',
        },
      },
    }),
  }),
);
const pastebin = require('../lib/getpastebin');
const endpointStatus = require('../middleware/endpoint-status');
router.get(
  '/getpastebin',
  (req, res, next) => {
    const raw = req.query.url;
    if (typeof raw !== 'string' || !raw.trim()) {
      return reject(res, 400, 'INVALID_URL', 'Parameter url wajib diisi.');
    }
    if (raw.length > 2048) {
      return reject(res, 400, 'INVALID_URL', 'Parameter url terlalu panjang.');
    }
    try {
      req.pastebinInput = pastebin.parseInput(raw);
    } catch (error) {
      return reject(res, 400, 'INVALID_URL', error.message);
    }
    const header = req.get('x-api-key');
    const queryKey = req.query.apikey;
    const key = header || queryKey;
    if (
      typeof key !== 'string' ||
      !/^[a-z0-9_-]{1,128}$/i.test(key) ||
      (queryKey !== undefined &&
        (typeof queryKey !== 'string' || (header && header !== queryKey)))
    ) {
      return reject(
        res,
        401,
        'INVALID_KEY',
        'Gunakan satu API key yang valid melalui header x-api-key.',
      );
    }
    next();
  },
  endpointStatus('/api/tools/getpastebin', {
    maintenance: 'Endpoint Pastebin sedang maintenance.',
  }),
  require('../middleware/entitlement'),
  authorize,
  createJsonHandler({
    work: (req, signal) =>
      pastebin.getPastebin(req.pastebinInput, { signal }),
    mapError: pastebin.errorResponse,
  }),
);

require('./hd')(router, authorize);
module.exports = router;

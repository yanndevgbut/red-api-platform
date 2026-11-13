const express = require('express');
const { tiktokio, isTikTokUrl } = require('../lib/tiktokio');
const authentication = require('../middleware/auth');
const router = express.Router();
// Support existing panel nodes during rollout without replacing their quota RPC.
const authorize = typeof authentication.authorize === 'function' ? authentication.authorize() : authentication;

router.get('/tiktok', (req, res, next) => {
  if (!isTikTokUrl(req.query.url)) return res.status(400).json({ status: false, code: 400, message: 'Provide a valid HTTPS TikTok URL in the url parameter.' });
  const key = req.get('x-api-key') || req.query.apikey;
  if (req.query.apikey !== undefined && (typeof req.query.apikey !== 'string' || (req.get('x-api-key') && req.query.apikey !== req.get('x-api-key')))) return res.status(401).json({ status: false, code: 401, message: 'Provide one valid API key.' });
  if (typeof key !== 'string' || key.length > 128 || !/^[a-z0-9_-]+$/i.test(key)) return res.status(401).json({ status: false, code: 401, message: 'Provide a valid API key in the x-api-key header.' });
  next();
}, require('../middleware/entitlement'), authorize, async (req, res) => {
  try {
    const result = await tiktokio(req.query.url);
    return res.json({ status: true, creator: 'RED API Engine', user_plan: req.apiUser.plan, quota_remaining: req.apiUser.remaining, result });
  } catch (error) {
    const status = error.name === 'TimeoutError' || error.name === 'AbortError' ? 504 : 502;
    return res.status(status).json({ status: false, code: status, message: status === 504 ? 'TikTok downloader timed out. Please try again.' : 'TikTokio could not retrieve downloadable media. The video may be unavailable or the provider may be busy.' });
  }
});

module.exports = router;

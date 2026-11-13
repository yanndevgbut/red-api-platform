const express = require('express');
const { lookup, isValidUid } = require('../lib/stalk-ff');
const authentication = require('../middleware/auth');
const router = express.Router();
const authorize = typeof authentication.authorize === 'function' ? authentication.authorize() : authentication;

router.get('/ff', (req, res, next) => {
  if (!isValidUid(req.query.uid)) return res.status(400).json({ status: false, code: 400, message: 'Parameter uid harus berisi 8–11 digit.' });
  const key = req.get('x-api-key') || req.query.apikey;
  if (req.query.apikey !== undefined && (typeof req.query.apikey !== 'string' || (req.get('x-api-key') && req.query.apikey !== req.get('x-api-key')))) return res.status(401).json({ status: false, code: 401, message: 'Gunakan satu API key yang valid.' });
  if (typeof key !== 'string' || key.length > 128 || !/^[a-z0-9_-]+$/i.test(key)) return res.status(401).json({ status: false, code: 401, message: 'API key diperlukan melalui header x-api-key.' });
  next();
}, require('../middleware/entitlement'), authorize, async (req, res) => {
  try {
    const result = await lookup(req.query.uid);
    res.json({ status: true, creator: 'RED API Engine', user_plan: req.apiUser.plan, quota_remaining: req.apiUser.remaining, result });
  } catch (error) {
    const code = ['TimeoutError', 'AbortError'].includes(error.name) ? 504 : error.name === 'ProfileNotFoundError' ? 404 : 502;
    res.status(code).json({ status: false, code, message: { 404: 'Profil Free Fire tidak ditemukan.', 502: 'Provider profil Free Fire belum dapat mengambil data. Silakan coba lagi.', 504: 'Permintaan profil Free Fire melewati batas waktu.' }[code] });
  }
});
module.exports = router;

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
const robloxstalk = require('../lib/robloxstalk');
const endpointStatus = require('../middleware/endpoint-status');
router.get('/robloxstalk', (req, res, next) => {
  try { req.robloxUsername = robloxstalk.normalizeUsername(req.query.username); }
  catch (error) { const result = robloxstalk.errorResponse(error); return res.status(result.status).json(result.body); }
  const key = req.get('x-api-key') || req.query.apikey;
  if (req.query.apikey !== undefined && (typeof req.query.apikey !== 'string' || (req.get('x-api-key') && req.query.apikey !== req.get('x-api-key')))) return res.status(401).json({success:false,error:{code:'INVALID_KEY',message:'Gunakan satu API key yang valid.'}});
  if (typeof key !== 'string' || key.length > 128 || !/^[a-z0-9_-]+$/i.test(key)) return res.status(401).json({success:false,error:{code:'INVALID_KEY',message:'API key diperlukan melalui header x-api-key.'}});
  next();
}, endpointStatus('/api/stalk/robloxstalk', { maintenance: 'Endpoint Roblox Stalk sedang maintenance.' }), require('../middleware/entitlement'), authorize, require('../lib/json-response').createJsonHandler({
  work: (req, signal) => robloxstalk.robloxStalk(req.robloxUsername, { signal }),
  mapError: robloxstalk.errorResponse,
  heartbeatMs: 16000,
}));
const tiktokProfile = require('../lib/stalktt');
let tiktokProfileActive = false;
router.get('/stalktt', (req, res, next) => {
  try { req.tiktokUsername = tiktokProfile.normalizeUsername(req.query.username); }
  catch (error) { return res.status(400).json({success:false,error:{code:'INVALID_USERNAME',message:error.message}}); }
  const key = req.get('x-api-key') || req.query.apikey;
  if (req.query.apikey !== undefined && (typeof req.query.apikey !== 'string' || (req.get('x-api-key') && req.query.apikey !== req.get('x-api-key')))) return res.status(401).json({success:false,error:{code:'INVALID_KEY',message:'Gunakan satu API key yang valid.'}});
  if (typeof key !== 'string' || key.length > 128 || !/^[a-z0-9_-]+$/i.test(key)) return res.status(401).json({success:false,error:{code:'INVALID_KEY',message:'API key diperlukan melalui header x-api-key.'}});
  next();
}, async (req, res, next) => {
  // Keep registry maintenance effective on panel nodes using the legacy quota RPC.
  try {
    const {data, error} = await require('../config/supabase').from('endpoints').select('status').eq('path', '/api/stalk/stalktt').maybeSingle();
    if (res.destroyed || res.writableEnded) return;
    if (error) return res.status(503).json({success:false,error:{code:'ENDPOINT_UNAVAILABLE',message:'Status endpoint belum dapat diverifikasi.'}});
    if (!data || data.status === 'deprecated') return res.status(404).json({success:false,error:{code:'ENDPOINT_UNAVAILABLE',message:'Endpoint belum tersedia.'}});
    if (data.status !== 'active') return res.status(503).json({success:false,error:{code:'ENDPOINT_MAINTENANCE',message:'Endpoint TikTok Stalk sedang maintenance karena akses provider belum tersedia.'}});
    next();
  } catch { if (!res.destroyed) res.status(503).json({success:false,error:{code:'ENDPOINT_UNAVAILABLE',message:'Status endpoint belum dapat diverifikasi.'}}); }
}, (req, res, next) => {
  if (tiktokProfileActive) { res.set('Retry-After', '10'); return res.status(503).json({success:false,error:{code:'PROVIDER_BUSY',message:'Pengambilan profil TikTok sedang sibuk. Coba lagi sebentar.'}}); }
  tiktokProfileActive = true; let released = false;
  req.tiktokRelease = () => { if (!released) { released = true; tiktokProfileActive = false; } };
  const releaseBeforeWork = () => { if (!req.tiktokStarted) req.tiktokRelease(); };
  res.once('finish', releaseBeforeWork); res.once('close', releaseBeforeWork);
  next();
}, require('../middleware/entitlement'), authorize, require('../lib/json-response').createJsonHandler({
  work:async(req,signal)=> { req.tiktokStarted = true; try { return await tiktokProfile.getTikTokProfile(req.tiktokUsername,{signal}); } finally { req.tiktokRelease(); } },
  mapError:tiktokProfile.errorResponse,
}));
module.exports = router;

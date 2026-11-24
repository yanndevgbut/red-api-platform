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

const { scrapePinterest, isPinterestUrl } = require('../lib/pindl');
router.get('/pindl', (req,res,next) => {
  if (!isPinterestUrl(req.query.url)) return res.status(400).json({success:false,error:'Gunakan parameter url berupa URL pin.it atau pinterest.com/pin/ID/.'});
  const key = req.get('x-api-key') || req.query.apikey;
  if (req.query.apikey !== undefined && (typeof req.query.apikey !== 'string' || (req.get('x-api-key') && req.query.apikey !== req.get('x-api-key')))) return res.status(401).json({success:false,error:'Gunakan satu API key yang valid.'});
  if (typeof key !== 'string' || key.length > 128 || !/^[a-z0-9_-]+$/i.test(key)) return res.status(401).json({success:false,error:'API key diperlukan melalui header x-api-key.'});
  next();
}, require('../middleware/entitlement'), authorize, async (req,res) => {
  try { res.json({success:true,data:await scrapePinterest(req.query.url)}); }
  catch(error) {
    const code = ['TimeoutError','AbortError'].includes(error.name) ? 504 : error.name === 'PinNotFoundError' ? 404 : 502;
    res.status(code).json({success:false,error:{404:'Pin publik tidak ditemukan.',502:'Media Pinterest belum dapat diambil. Pastikan pin bersifat publik dan coba lagi.',504:'Permintaan Pinterest melewati batas waktu. Coba lagi.'}[code]});
  }
});

const { readInput, conversionSlots, createHandler } = require('../lib/ytdl-response');
router.get('/ytdl', (req,res,next)=>{
  try {req.ytdlInput=readInput(req.query);} catch(error) {return res.status(400).json({success:false,error:{code:error.code || 'INVALID_URL',message:error.message}});}
  const key=req.get('x-api-key') || req.query.apikey;
  if(req.query.apikey!==undefined && (typeof req.query.apikey!=='string' || (req.get('x-api-key') && req.query.apikey!==req.get('x-api-key'))))return res.status(401).json({success:false,error:{code:'INVALID_KEY',message:'Gunakan satu API key yang valid.'}});
  if(typeof key!=='string' || key.length>128 || !/^[a-z0-9_-]+$/i.test(key))return res.status(401).json({success:false,error:{code:'INVALID_KEY',message:'API key diperlukan melalui header x-api-key.'}});
  next();
}, conversionSlots(), require('../middleware/entitlement'), authorize, createHandler());

const instagram = require('../lib/igdl');
router.get('/igdl',(req,res,next)=>{
  try {req.instagramInput=instagram.normalizeInput(req.query.url);}catch(error){return res.status(400).json({success:false,error:{code:'INVALID_URL',message:error.message}});}
  const key=req.get('x-api-key') || req.query.apikey;
  if(req.query.apikey!==undefined && (typeof req.query.apikey!=='string' || (req.get('x-api-key') && req.query.apikey!==req.get('x-api-key'))))return res.status(401).json({success:false,error:{code:'INVALID_KEY',message:'Gunakan satu API key yang valid.'}});
  if(typeof key!=='string' || key.length>128 || !/^[a-z0-9_-]+$/i.test(key))return res.status(401).json({success:false,error:{code:'INVALID_KEY',message:'API key diperlukan melalui header x-api-key.'}});
  next();
}, require('../middleware/entitlement'), authorize, require('../lib/json-response').createJsonHandler({work:(req,signal)=>instagram.scrapeInstagram(req.instagramInput.source,{signal}),mapError:instagram.errorResponse}));

const facebook = require('../lib/fbdl');
const facebookFailure = (res, error) => {
  const { status, body } = facebook.errorResponse(error);
  return res.status(status).json(body);
};

router.get('/fbdl', (req, res, next) => {
  try {
    req.facebookUrl = facebook.validate(req.query.url).href;
  } catch (error) {
    return facebookFailure(res, error);
  }

  const header = req.get('x-api-key');
  const queryKey = req.query.apikey;
  const key = header || queryKey;
  if (typeof key !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(key) ||
      (queryKey !== undefined && (typeof queryKey !== 'string' || (header && header !== queryKey)))) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_KEY', message: 'Gunakan satu API key yang valid melalui header x-api-key.' },
    });
  }
  next();
}, require('../middleware/entitlement'), authorize, require('../lib/json-response').createJsonHandler({
  work: (req, signal) => facebook.scrape(req.facebookUrl, { signal }),
  mapError: facebook.errorResponse,
}));

module.exports = router;

const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const { isWebUrl, validateInput } = require('../middleware/validate');

// GET /api/tools/ssweb?url=...
router.get('/ssweb', validateInput(req => req.query, {
  url: value => isWebUrl(value)
}), authorize('vip'), (req, res) => {
  const { url } = req.apiInput;

  res.json({
    status: true,
    creator: 'RED/API Engine',
    user_plan: req.apiUser.plan,
    quota_remaining: req.apiUser.remaining,
    result: {
      target_url: url,
      rendered_at: new Date().toISOString(),
      viewport: '1920x1080',
      screenshot_url: `https://image.thum.io/get/width/1200/crop/675/${encodeURIComponent(url)}`
    }
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const { isWebUrl, validateInput } = require('../middleware/validate');

// GET /api/whatsapp/chinfo?channelUrl=...
router.get('/chinfo', validateInput(req => req.query, {
  channelUrl: value => isWebUrl(value, 'whatsapp.com', '/channel/')
}), authorize('vip'), (req, res) => {
  res.json({
    status: true,
    creator: 'RED/API Engine',
    user_plan: req.apiUser.plan,
    quota_remaining: req.apiUser.remaining,
    simulated: true,
    result: {
      channel_title: 'Official Updates & Patch Notes',
      verified: true,
      followers: '124,580',
      description: 'Official WhatsApp Newsletter Channel',
      created_at: '2024-01-15'
    }
  });
});

module.exports = router;

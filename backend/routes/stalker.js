const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const { isText, validateInput } = require('../middleware/validate');

// GET /api/stalk/ml?userId=...&zoneId=...
router.get('/ml', validateInput(req => req.query, {
  userId: value => isText(value, 20) && /^\d+$/.test(value),
  zoneId: value => isText(value, 12) && /^\d+$/.test(value)
}), authorize(), (req, res) => {
  const { userId, zoneId } = req.apiInput;

  res.json({
    status: true,
    creator: 'RED/API Engine',
    user_plan: req.apiUser.plan,
    quota_remaining: req.apiUser.remaining,
    simulated: true,
    result: {
      userId: userId,
      zoneId: zoneId,
      nickname: `Player_${userId.substring(0, 4)}`,
      country: 'Indonesia',
      verified: true
    }
  });
});

module.exports = router;

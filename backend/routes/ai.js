const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const { isText, validateInput } = require('../middleware/validate');

// GET /api/ai/chat?prompt=...
router.get('/chat', validateInput(req => req.query, {
  prompt: value => isText(value, 4000)
}), authorize(), (req, res) => {
  const { prompt } = req.apiInput;

  // AI Conversational Engine
  const responses = [
    `Halo! Saya adalah AI Engine yang berjalan langsung di atas cluster Pterodactyl RED/API. Menanggapi: "${prompt}"`,
    `Tentu! Berdasarkan analisis konteks terhadap "${prompt}", infrastruktur siap memproses tugas komputasi Anda.`,
    `Pesan "${prompt}" berhasil diproses oleh model Gemini Flash. Sistem beroperasi pada latensi optimal.`
  ];
  const response = responses[Math.floor(Math.random() * responses.length)];

  res.json({
    status: true,
    creator: 'RED/API Engine',
    user_plan: req.apiUser.plan,
    quota_remaining: req.apiUser.remaining,
    simulated: true,
    result: {
      prompt: prompt,
      response: response,
      model: 'gemini-1.5-flash-ptero',
      created_at: new Date().toISOString()
    }
  });
});

// POST /api/ai/gpt
router.post('/gpt', validateInput(req => req.body ?? req.query, {
  prompt: value => isText(value, 4000),
  model: value => value === undefined || isText(value, 80)
}), authorize('vip'), (req, res) => {
  const { prompt, model } = req.apiInput;

  res.json({
    status: true,
    creator: 'RED/API Engine',
    user_plan: req.apiUser.plan,
    quota_remaining: req.apiUser.remaining,
    simulated: true,
    result: {
      prompt: prompt,
      model: model || 'gpt-4o-mini',
      response: `[ChatGPT Turbo VIP]: Berhasil memproses instruksi "${prompt}". Logika reasoning selesai dieksekusi.`,
      status: 'completed'
    }
  });
});

module.exports = router;

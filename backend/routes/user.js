const express = require('express');
const supabase = require('../config/supabase');
const createUserClient = require('../lib/user-client');
const rotateApiKey = require('../lib/rotate-api-key');
const router = express.Router();
const inFlight = new Set();

router.post('/api-key/rotate', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const token = req.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 8192) return res.status(401).json({ error: 'Login diperlukan.' });
  if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) return res.status(400).json({ error: 'Rotasi hanya berlaku untuk akun yang sedang login.' });
  let account;
  let locked = false;
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Sesi sudah tidak valid. Silakan login kembali.' });
    account = user.id;
    if (inFlight.has(account)) return res.status(409).json({ error: 'Rotasi API key sedang diproses. Tunggu sebentar lalu muat ulang akun.' });
    inFlight.add(account); locked = true;
    const profile = await supabase.from('profiles').select('id,banned').eq('id', account).maybeSingle();
    if (profile.error) throw new Error('Profile unavailable');
    if (!profile.data || profile.data.banned !== false) return res.status(403).json({ error: 'Akun aktif diperlukan untuk mengganti API key.' });
    req.apiUser = { id: account };
    const apiKey = await rotateApiKey(supabase, createUserClient(token), account);
    return res.json({ apiKey });
  } catch {
    return res.status(503).json({ error: 'Rotasi API key belum dapat diselesaikan. Muat ulang akun sebelum mencoba lagi.' });
  } finally { if (locked) inFlight.delete(account); }
});
module.exports = router;

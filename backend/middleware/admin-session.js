const supabase = require('../config/supabase');
module.exports = async function requireAdminSession(req, res, next) {
  const token = req.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 8192) return res.status(401).json({ error: 'Login administrator diperlukan.' });
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Sesi tidak valid.' });
    const profile = await supabase.from('profiles').select('role,banned').eq('id', user.id).maybeSingle();
    if (profile.error) return res.status(503).json({ error: 'Verifikasi administrator belum tersedia.' });
    if (profile.data?.role !== 'admin' || profile.data?.banned !== false) return res.status(403).json({ error: 'Administrator aktif diperlukan.' });
    req.apiUser = { id: user.id };
    next();
  } catch { return res.status(503).json({ error: 'Verifikasi administrator belum tersedia.' }); }
};

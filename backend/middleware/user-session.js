const supabase = require('../config/supabase');
module.exports = async function userSession(req, res, next) {
  const token = req.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 8192)
    return res.status(401).json({ error: 'Login diperlukan.' });
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user)
      return res.status(401).json({ error: 'Sesi tidak valid.' });
    const profile = await supabase
      .from('profiles')
      .select('id,role,banned')
      .eq('id', user.id)
      .maybeSingle();
    if (profile.error)
      return res.status(503).json({ error: 'Akun belum dapat diverifikasi.' });
    if (!profile.data || profile.data.banned !== false)
      return res.status(403).json({ error: 'Akun aktif diperlukan.' });
    req.portalUser = {
      id: user.id,
      email: user.email || '',
      admin: profile.data.role === 'admin',
    };
    req.apiUser = { id: user.id };
    next();
  } catch {
    return res.status(503).json({ error: 'Akun belum dapat diverifikasi.' });
  }
};

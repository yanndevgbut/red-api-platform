const supabase = require('../config/supabase');
const { ensureEntitlement } = require('../lib/billing');
module.exports = async (req, res, next) => {
  try {
    const key = req.get('x-api-key') || req.query.apikey;
    const result = await supabase
      .from('api_keys')
      .select('user_id')
      .eq('key', key)
      .eq('is_active', true)
      .maybeSingle();
    if (result.error) throw new Error();
    if (result.data) await ensureEntitlement(result.data.user_id);
    next();
  } catch {
    res
      .status(503)
      .json({ error: 'Status paket belum dapat diverifikasi. Coba lagi.' });
  }
};

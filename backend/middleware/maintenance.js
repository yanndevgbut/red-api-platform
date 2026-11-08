const supabase = require('../config/supabase');

let cachedMaintenance = {
  active: false,
  message: 'System under scheduled maintenance.',
  lastFetch: 0
};

async function checkMaintenance(req, res, next) {
  // Monitoring and control routes remain available even during a database outage.
  if (req.path === '/api/system/stats' || req.path.startsWith('/api/admin/')) return next();
  const now = Date.now();
  // Cache for 10 seconds to avoid slamming database
  if (now - cachedMaintenance.lastFetch > 10000) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('maintenance_mode, maintenance_message')
        .eq('id', 1)
        .single();

      if (error) console.error('[MAINTENANCE_CHECK_ERR]', error.code);
      if (data) {
        cachedMaintenance.active = Boolean(data.maintenance_mode);
        cachedMaintenance.message = data.maintenance_message || 'System under scheduled maintenance.';
      }
      cachedMaintenance.lastFetch = now;
    } catch (err) {
      console.error('[MAINTENANCE_CHECK_ERR]', err.message);
    }
  }

  if (cachedMaintenance.active) {
    return res.status(503).json({
      status: false,
      code: 503,
      message: cachedMaintenance.message
    });
  }

  next();
}

module.exports = checkMaintenance;

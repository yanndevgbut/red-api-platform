const supabase = require('../config/supabase');
const authentication = require('./auth');

// Nodes on the legacy quota RPC export a plain middleware that charges quota
// without consulting the endpoint registry. Those nodes need an explicit gate;
// nodes running authorize_api_request already reject maintenance endpoints.
const legacy = typeof authentication.authorize !== 'function';

module.exports = function endpointStatus(path, options = {}) {
  const unavailable = options.unavailable || 'Endpoint belum tersedia.';
  const maintenance = options.maintenance || 'Endpoint sedang maintenance.';
  return async (req, res, next) => {
    if (!legacy) return next();
    try {
      const { data, error } = await supabase
        .from('endpoints')
        .select('status')
        .eq('path', path)
        .maybeSingle();
      if (res.destroyed || res.writableEnded) return;
      if (error) throw error;
      if (!data || data.status === 'deprecated') {
        return res.status(404).json({ success: false, error: { code: 'ENDPOINT_UNAVAILABLE', message: unavailable } });
      }
      if (data.status !== 'active') {
        return res.status(503).json({ success: false, error: { code: 'ENDPOINT_MAINTENANCE', message: maintenance } });
      }
      next();
    } catch {
      if (!res.destroyed) {
        res.status(503).json({ success: false, error: { code: 'ENDPOINT_UNAVAILABLE', message: 'Status endpoint belum dapat diverifikasi.' } });
      }
    }
  };
};

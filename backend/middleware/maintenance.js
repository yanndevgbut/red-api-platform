const { getMaintenance } = require('../lib/maintenance-state');
module.exports = async function checkMaintenance(req, res, next) {
  if (req.path === '/api/system/stats' || req.path.startsWith('/api/admin/'))
    return next();
  try {
    const state = await getMaintenance();
    if (state.active)
      return res
        .status(503)
        .json({ status: false, code: 503, message: state.message });
    next();
  } catch {
    return res
      .status(503)
      .json({
        status: false,
        code: 503,
        message: 'Status layanan belum dapat diverifikasi. Silakan coba lagi.',
      });
  }
};

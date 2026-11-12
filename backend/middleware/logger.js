const supabase = require('../config/supabase');

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const fullPath = (req.originalUrl ? req.originalUrl.split('?')[0] : req.path).slice(0, 512);
    // Only log API routes, ignore static / favicon
    if (!fullPath.startsWith('/api/')) return;

    const latency = Date.now() - start;
    const ip = req.socket.remoteAddress || '127.0.0.1';

    // Asynchronously insert log to Supabase
    supabase.from('api_logs').insert({
      user_id: req.apiUser?.id ?? null,
      ip_address: String(ip).split(',')[0].trim(),
      method: req.method,
      endpoint_path: fullPath,
      status_code: res.statusCode,
      latency_ms: latency
    }).then(({ error }) => {
      if (error) console.error('[LOGGER_ERR]', error.code);
    }).catch(err => {
      console.error('[LOGGER_ERR]', err.message);
    });
  });

  next();
}

module.exports = requestLogger;

module.exports = function rateLimit({ max = 600, windowMs = 60000, maxEntries = 5000 } = {}) {
  const entries = new Map();
  return (req, res, next) => {
    if (!req.path.startsWith('/api/') || req.path.startsWith('/api/system/')) return next();
    const now = Date.now();
    // Do not trust caller-supplied X-Forwarded-For on a directly accessible origin.
    const key = req.socket.remoteAddress || 'unknown';
    let item = entries.get(key);
    if (!item || item.expires <= now) {
      for (const [address, value] of entries) if (value.expires <= now) entries.delete(address);
      if (entries.size >= maxEntries) return res.status(503).json({ error: 'Server sedang sibuk.' });
      item = { count: 0, expires: now + windowMs }; entries.set(key, item);
    }
    item.count++;
    if (item.count > max) { res.set('Retry-After', String(Math.ceil((item.expires - now) / 1000))); return res.status(429).json({ error: 'Terlalu banyak request. Silakan coba lagi.' }); }
    next();
  };
};

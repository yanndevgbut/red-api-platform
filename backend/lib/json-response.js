function createJsonHandler({ work, mapError, heartbeatMs = 10000 }) {
  return async (req, res) => {
    if (res.destroyed || res.writableEnded) return;
    const controller = new AbortController();
    let heartbeat,
      streamed = false,
      closed = false;
    const disconnect = () => {
      if (!res.writableEnded) {
        closed = true;
        controller.abort();
      }
    };
    res.once('close', disconnect);
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Cache-Control', 'no-store, no-transform');
    res.set('X-Accel-Buffering', 'no');
    // Whitespace preserves one valid JSON document while keeping the connection active.
    heartbeat = setInterval(() => {
      if (closed || res.destroyed) return;
      if (!streamed) {
        res.status(200);
        res.flushHeaders();
        streamed = true;
      }
      res.write(' '.repeat(1024) + '\n');
    }, heartbeatMs);
    heartbeat.unref();
    try {
      const data = await work(req, controller.signal);
      if (!closed && !res.destroyed) {
        if (streamed) res.end(JSON.stringify({ success: true, data }));
        else res.json({ success: true, data });
      }
    } catch (error) {
      if (!closed && !res.destroyed) {
        const result = mapError(error);
        if (streamed) res.end(JSON.stringify(result.body));
        else {
          if (result.status === 429) res.set('Retry-After', '60');
          res.status(result.status).json(result.body);
        }
      }
    } finally {
      clearInterval(heartbeat);
      res.off('close', disconnect);
    }
  };
}
module.exports = { createJsonHandler };

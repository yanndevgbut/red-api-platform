const http = require('node:http');
const net = require('node:net');
const dns = require('node:dns/promises');
const { fromRuntime } = require('./ssweb-runtime');
const blocked = () =>
  Object.assign(
    new Error('Akses jaringan privat atau URL tujuan tidak diizinkan.'),
    { code: 'BLOCKED_TARGET' },
  );
function ipLibrary() {
  try {
    return fromRuntime('ipaddr.js');
  } catch {
    return require('ipaddr.js');
  }
}
function publicIP(input) {
  try {
    const value = ipLibrary().process(input);
    return (
      value.range() === 'unicast' &&
      (value.kind() !== 'ipv6' || value.match(ipLibrary().parse('2000::'), 3))
    );
  } catch {
    return false;
  }
}
function validateURL(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048)
    throw blocked();
  let url;
  try {
    url = new URL(input);
  } catch {
    throw blocked();
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw blocked();
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(host)) {
    if (!publicIP(host)) throw blocked();
  } else if (
    !host.includes('.') ||
    /\.(localhost|local|internal|lan|home|test|invalid)$/.test(host) ||
    host.endsWith('.')
  )
    throw blocked();
  return url;
}
async function resolvePublic(host, { lookup = dns.lookup } = {}) {
  const name = host.replace(/^\[|\]$/g, '');
  if (net.isIP(name)) {
    if (!publicIP(name)) throw blocked();
    return { address: name, family: net.isIP(name) };
  }
  let timer;
  const addresses = await Promise.race([
    lookup(name, { all: true, verbatim: true }),
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            Object.assign(new Error('DNS tujuan melewati batas waktu.'), {
              code: 'DNS_UNAVAILABLE',
            }),
          ),
        5000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (
    !Array.isArray(addresses) ||
    !addresses.length ||
    addresses.some((row) => !publicIP(row.address))
  )
    throw blocked();
  return addresses.find((row) => row.family === 4) || addresses[0];
}
async function startEgressProxy({
  resolve = resolvePublic,
  connect = (options) => net.connect(options),
  requestImpl = http.request,
  maxDownloadBytes = 40 * 1024 * 1024,
  maxUploadBytes = 8 * 1024 * 1024,
} = {}) {
  const sockets = new Set();
  let closed = false,
    bytes = 0,
    uploaded = 0,
    requests = 0,
    failure = null;
  const track = (socket) => {
    if (closed || sockets.size >= 48) {
      failure ||= 'TRANSFER_LIMIT';
      socket.on('error', () => {});
      socket.destroy();
      return socket;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    return socket;
  };
  function stopTraffic(code) {
    failure = code;
    for (const socket of sockets) socket.destroy();
  }
  function budget(chunk) {
    bytes += chunk.length;
    if (bytes > maxDownloadBytes) stopTraffic('TRANSFER_LIMIT');
  }
  function uploadBudget(chunk) {
    uploaded += chunk.length;
    if (uploaded > maxUploadBytes) stopTraffic('TRANSFER_LIMIT');
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (closed || ++requests > 300 || sockets.size > 48) throw blocked();
      const url = validateURL(req.url);
      if (url.protocol !== 'http:') throw blocked();
      const target = await resolve(url.hostname);
      if (closed || req.destroyed) return;
      const headers = { ...req.headers, host: url.host };
      for (const key of [
        'proxy-authorization',
        'proxy-connection',
        'connection',
        'upgrade',
      ])
        delete headers[key];
      const upstream = requestImpl(
        {
          hostname: target.address,
          family: target.family,
          port: 80,
          path: url.pathname + url.search,
          method: req.method,
          headers,
          agent: false,
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.on('data', budget);
          response.pipe(res);
        },
      );
      upstream.on('socket', track);
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      upstream.setTimeout(20000, () => upstream.destroy());
      req.once('aborted', () => upstream.destroy());
      res.once('close', () => upstream.destroy());
      req.on('data', uploadBudget);
      req.pipe(upstream);
    } catch (error) {
      if (error.code === 'BLOCKED_TARGET') failure = 'BLOCKED_TARGET';
      res.writeHead(403);
      res.end();
    }
  });
  server.on('connection', track);
  server.on('connect', async (req, client, head) => {
    try {
      if (closed || ++requests > 300 || sockets.size > 48) throw blocked();
      const url = validateURL('https://' + req.url);
      if (url.pathname !== '/' || url.search || url.hash) throw blocked();
      const target = await resolve(url.hostname);
      if (closed || client.destroyed) return;
      // Connect to the validated IP, not a hostname that Chromium could resolve again.
      const upstream = track(
        connect({ host: target.address, family: target.family, port: 443 }),
      );
      upstream.setTimeout(20000, () => upstream.destroy());
      upstream.once('connect', () => {
        if (client.destroyed) return upstream.destroy();
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.on('data', uploadBudget);
        client.pipe(upstream);
        upstream.on('data', budget);
        upstream.pipe(client);
      });
      upstream.once('error', () => client.destroy());
      upstream.once('close', () => client.destroy());
      client.once('close', () => upstream.destroy());
    } catch (error) {
      if (error.code === 'BLOCKED_TARGET') failure = 'BLOCKED_TARGET';
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
  });
  server.on('upgrade', (_req, socket) => socket.destroy());
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    get failure() {
      return failure;
    },
    async close() {
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
module.exports = { publicIP, validateURL, resolvePublic, startEgressProxy };

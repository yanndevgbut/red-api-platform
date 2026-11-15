const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const {
  publicIP,
  validateURL,
  resolvePublic,
  startEgressProxy,
} = require('../backend/lib/ssweb-egress');
const { screenshotWeb, readInput, options } = require('../backend/lib/ssweb');
const { browserOptions } = require('../backend/lib/ssweb-runtime');
test('screenshot input blocks local/encoded/private targets and bounds mode, wait and full-page flags', () => {
  for (const url of [
    'http://localhost',
    'http://169.254.169.254/latest/meta-data',
    'http://127.0.0.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]',
    'http://10.0.0.1',
    'http://192.168.1.1',
    'http://100.100.100.200',
    'http://host.local',
    'http://host.internal',
    'http://user:pass@example.com',
    'https://example.com:8443',
    'file:///etc/passwd',
    'ftp://example.com',
    [],
    null,
  ])
    assert.throws(() => options(url), { code: 'BLOCKED_TARGET' });
  for (const address of [
    '0.0.0.0',
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.0.1',
    '169.254.1.1',
    '100.64.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '2001:db8::1',
    '::ffff:10.0.0.1',
  ])
    assert.equal(publicIP(address), false, address);
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])
    assert.equal(publicIP(address), true, address);
  assert.equal(
    options('https://example.com', { mode: 'dekstop' }).mode,
    'desktop',
  );
  assert.equal(options('https://example.com', { mode: 'mobile' }).mode, 'hp');
  for (const mode of ['wrong', '__proto__', ['mobile']])
    assert.throws(() => options('https://example.com', { mode }), {
      code: 'INVALID_MODE',
    });
  for (const waitMs of [-1, 30001, 1.5, '5000'])
    assert.throws(() => options('https://example.com', { waitMs }), {
      code: 'INVALID_WAIT',
    });
  assert.throws(() => options('https://example.com', { fullPage: 'false' }), {
    code: 'INVALID_OPTION',
  });
  assert.deepEqual(
    readInput({
      url: 'https://example.com',
      mode: '',
      fullPage: '',
      waitMs: '',
    }),
    {
      url: 'https://example.com/',
      mode: 'desktop',
      fullPage: false,
      waitMs: 5000,
    },
  );
  assert.throws(
    () => readInput({ url: 'https://example.com', fullPage: '1' }),
    { code: 'INVALID_OPTION' },
  );
});
test('DNS refuses mixed public/private answers, mapped addresses and rebinding before dialing', async () => {
  for (const addresses of [
    [{ address: '127.0.0.1', family: 4 }],
    [
      { address: '1.1.1.1', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ],
    [{ address: '::ffff:169.254.169.254', family: 6 }],
    [],
  ])
    await assert.rejects(
      () =>
        resolvePublic('public.example.com', { lookup: async () => addresses }),
      { code: 'BLOCKED_TARGET' },
    );
  let resolutions = 0,
    dials = [];
  const echo = net.createServer((s) => s.pipe(s));
  await new Promise((r) => echo.listen(0, '127.0.0.1', r));
  const proxy = await startEgressProxy({
    resolve: (host) =>
      resolvePublic(host, {
        lookup: async () => [
          { address: ++resolutions === 1 ? '1.1.1.1' : '127.0.0.1', family: 4 },
        ],
      }),
    connect: (opts) => {
      dials.push(opts);
      return net.connect(echo.address().port, '127.0.0.1');
    },
  });
  async function connect() {
    return new Promise((resolve, reject) => {
      const socket = net.connect(new URL(proxy.url).port, '127.0.0.1', () =>
        socket.write(
          'CONNECT public.example.com:443 HTTP/1.1\r\nHost: public.example.com\r\n\r\n',
        ),
      );
      socket.once('error', reject);
      socket.once('data', (data) => {
        socket.destroy();
        resolve(data.toString());
      });
    });
  }
  try {
    assert.match(await connect(), /200 Connection Established/);
    assert.equal(dials[0].host, '1.1.1.1');
    assert.match(await connect(), /403 Forbidden/);
    assert.equal(dials.length, 1);
    assert.equal(proxy.failure, 'BLOCKED_TARGET');
  } finally {
    await proxy.close();
    await new Promise((r) => echo.close(r));
  }
});
test('real Chromium renders desktop/tablet/HP PNGs, full-page output and blocks redirect/private subresources', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: 'http://127.0.0.1/private' });
      res.end();
      return;
    }
    if (req.url === '/private-resource') {
      res.end('<img src="http://169.254.169.254/latest/meta-data">');
      return;
    }
    const height = req.url === '/tall' ? 9000 : 1600;
    res.end(
      `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture</title></head><body style="margin:0;background:#161616;color:white;font-family:sans-serif"><main style="height:${height}px;background:linear-gradient(#dc2626,#08080a)"><h1>RED API screenshot</h1><p>Public fixture</p></main><script>document.title='width='+innerWidth;</script></body></html>`,
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const proxyFactory = () =>
    startEgressProxy({
      resolve: async () => ({ address: '127.0.0.1', family: 4 }),
      requestImpl: (opts, callback) =>
        http.request({ ...opts, port: server.address().port }, callback),
    });
  const deps = { proxyFactory, browserFactory: browserOptions };
  try {
    for (const [mode, width, height] of [
      ['desktop', 1440, 900],
      ['tablet', 768, 1024],
      ['hp', 390, 844],
    ]) {
      const result = await screenshotWeb(
        'http://fixture.example.com/',
        { mode, waitMs: 0 },
        deps,
      );
      assert.equal(result.mode, mode);
      assert.equal(result.image.width, width);
      assert.equal(result.image.height, height);
      assert.equal(result.title, 'width=' + width);
      assert.equal(
        Buffer.from(result.image.base64, 'base64').subarray(1, 4).toString(),
        'PNG',
      );
    }
    const full = await screenshotWeb(
      'http://fixture.example.com/',
      { fullPage: true, waitMs: 0 },
      deps,
    );
    assert.ok(full.image.height >= 1600);
    assert.equal(full.full_page, true);
    await assert.rejects(
      () =>
        screenshotWeb(
          'http://fixture.example.com/tall',
          { fullPage: true, waitMs: 0 },
          deps,
        ),
      { code: 'PAGE_TOO_LARGE' },
    );
    for (const path of ['/redirect', '/private-resource'])
      await assert.rejects(
        () =>
          screenshotWeb(
            'http://fixture.example.com' + path,
            { waitMs: 0 },
            deps,
          ),
        { code: 'BLOCKED_TARGET' },
      );
  } finally {
    await new Promise((r) => server.close(r));
  }
});

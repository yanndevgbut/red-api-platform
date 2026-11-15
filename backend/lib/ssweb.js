const { browserOptions } = require('./ssweb-runtime');
const { validateURL, startEgressProxy } = require('./ssweb-egress');
const fail = (code, message) => Object.assign(new Error(message), { code });
const profiles = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
  tablet: {
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
  },
  hp: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
function options(
  input,
  { mode = 'desktop', fullPage = false, waitMs = 5000 } = {},
) {
  const url = validateURL(input);
  if (typeof mode !== 'string')
    throw fail('INVALID_MODE', 'Pilihan mode: desktop, tablet, hp.');
  mode = { dekstop: 'desktop', mobile: 'hp', phone: 'hp' }[mode] || mode;
  if (typeof mode !== 'string' || !Object.hasOwn(profiles, mode))
    throw fail('INVALID_MODE', 'Pilihan mode: desktop, tablet, hp.');
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 30000)
    throw fail('INVALID_WAIT', 'Waktu tunggu harus 0–30000 milidetik.');
  if (typeof fullPage !== 'boolean')
    throw fail('INVALID_OPTION', 'fullPage harus boolean.');
  return { url: url.href, mode, fullPage, waitMs };
}
function readInput(query) {
  const integer = (value) => {
    if (value === undefined || value === '') return 5000;
    if (typeof value !== 'string' || !/^\d{1,5}$/.test(value))
      throw fail('INVALID_WAIT', 'waitMs harus angka bulat 0–30000.');
    return Number(value);
  };
  const boolean = (value) => {
    if (value === undefined || value === '') return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw fail('INVALID_OPTION', 'fullPage harus true atau false.');
  };
  return options(query.url, {
    mode:
      query.mode === undefined || query.mode === '' ? 'desktop' : query.mode,
    fullPage: boolean(query.fullPage),
    waitMs: integer(query.waitMs),
  });
}
async function screenshotWeb(
  input,
  config = {},
  {
    browserFactory = browserOptions,
    proxyFactory = startEgressProxy,
    signal,
  } = {},
) {
  const selected = options(input, config);
  let browser,
    proxy,
    context,
    closed = false,
    timer,
    blockedResource = false;
  let cleanupTask;
  const close = () => {
    if (!cleanupTask) {
      closed = true;
      cleanupTask = (async () => {
        await browser?.close().catch(() => {});
        await proxy?.close().catch(() => {});
      })();
    }
    return cleanupTask;
  };
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        fail('SCREENSHOT_TIMEOUT', 'Screenshot melewati batas waktu 75 detik.'),
      );
      void close();
    }, 75000);
    timer.unref();
  });
  const onAbort = () => void close();
  if (signal?.aborted)
    throw fail('SCREENSHOT_CANCELLED', 'Permintaan dibatalkan.');
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([
      timeout,
      (async () => {
        proxy = await proxyFactory();
        if (closed) {
          await proxy.close();
          throw fail('SCREENSHOT_CANCELLED', 'Permintaan dibatalkan.');
        }
        const runtime = await browserFactory();
        if (closed)
          throw fail('SCREENSHOT_CANCELLED', 'Permintaan dibatalkan.');
        browser = await runtime.chromium.launch({
          ...runtime.launch,
          timeout: 15000,
          proxy: { server: proxy.url },
          args: [
            ...runtime.launch.args,
            '--proxy-bypass-list=<-loopback>',
            '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
          ],
        });
        if (closed) {
          await browser.close();
          throw fail('SCREENSHOT_CANCELLED', 'Permintaan dibatalkan.');
        }
        const agent =
          selected.mode === 'tablet'
            ? runtime.devices['iPad Mini'].userAgent
            : selected.mode === 'hp'
              ? runtime.devices['Pixel 7'].userAgent
              : undefined;
        context = await browser.newContext({
          ...profiles[selected.mode],
          ...(agent ? { userAgent: agent } : {}),
          deviceScaleFactor: 1,
          acceptDownloads: false,
          serviceWorkers: 'block',
        });
        await context.routeWebSocket(/.*/, (socket) => socket.close());
        await context.route('**/*', async (route) => {
          try {
            validateURL(route.request().url());
            await route.continue();
          } catch {
            blockedResource = true;
            await route.abort('blockedbyclient').catch(() => {});
          }
        });
        const page = await context.newPage();
        context.on('page', (popup) => {
          if (popup !== page) void popup.close();
        });
        page.on('dialog', (dialog) => void dialog.dismiss());
        page.on('download', (download) => void download.cancel());
        page.setDefaultTimeout(10000);
        const response = await page.goto(selected.url, {
          waitUntil: 'domcontentloaded',
          timeout: 25000,
        });
        if (response?.status() >= 400)
          throw fail(
            `HTTP_${response.status()}`,
            `Website mengembalikan HTTP ${response.status()}.`,
          );
        await page
          .waitForLoadState('networkidle', { timeout: 3000 })
          .catch(() => {});
        await page.waitForTimeout(selected.waitMs);
        await page.evaluate(async () => {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
        });
        validateURL(page.url());
        if (blockedResource || proxy.failure === 'BLOCKED_TARGET')
          throw fail(
            'BLOCKED_TARGET',
            'Halaman mencoba mengakses URL atau jaringan privat.',
          );
        if (proxy.failure)
          throw fail(
            'TRANSFER_LIMIT',
            'Halaman melewati batas transfer screenshot.',
          );
        let clip;
        if (selected.fullPage) {
          const session = await context.newCDPSession(page);
          let metrics;
          try {
            metrics = await session.send('Page.getLayoutMetrics');
          } finally {
            await session.detach();
          }
          const content = metrics.cssContentSize || metrics.contentSize;
          const size = {
            width: Math.ceil(
              Math.max(content.width, profiles[selected.mode].viewport.width),
            ),
            height: Math.ceil(
              Math.max(content.height, profiles[selected.mode].viewport.height),
            ),
          };
          if (
            !Number.isFinite(size.width) ||
            !Number.isFinite(size.height) ||
            size.height > 8000 ||
            size.width > 1920 ||
            size.width * size.height > 12000000
          )
            throw fail(
              'PAGE_TOO_LARGE',
              'Halaman terlalu besar. Gunakan fullPage=false.',
            );
          // A fixed clip prevents a page growing after measurement from allocating an oversized PNG.
          clip = { x: 0, y: 0, ...size };
        }
        const title = (await page.title()).slice(0, 500);
        const image = await page.screenshot({
          type: 'png',
          fullPage: selected.fullPage,
          ...(clip ? { clip } : {}),
          animations: 'disabled',
          caret: 'hide',
          timeout: 15000,
        });
        if (image.length > 3 * 1024 * 1024)
          throw fail(
            'IMAGE_TOO_LARGE',
            'Gambar melebihi 3 MB. Gunakan fullPage=false.',
          );
        return {
          requested_url: selected.url,
          url: page.url(),
          title,
          mode: selected.mode,
          full_page: selected.fullPage,
          viewport: profiles[selected.mode].viewport,
          image: {
            mime_type: 'image/png',
            encoding: 'base64',
            width: image.readUInt32BE(16),
            height: image.readUInt32BE(20),
            size_bytes: image.length,
            base64: image.toString('base64'),
          },
        };
      })(),
    ]);
  } catch (error) {
    if (blockedResource || proxy?.failure === 'BLOCKED_TARGET')
      throw fail('BLOCKED_TARGET', 'Akses jaringan privat diblokir.');
    if (
      [
        'BLOCKED_TARGET',
        'SCREENSHOT_TIMEOUT',
        'SCREENSHOT_CANCELLED',
        'TRANSFER_LIMIT',
        'PAGE_TOO_LARGE',
        'IMAGE_TOO_LARGE',
        'BROWSER_UNAVAILABLE',
      ].includes(error.code) ||
      /^HTTP_\d{3}$/.test(error.code || '')
    )
      throw error;
    if (proxy?.failure === 'BLOCKED_TARGET')
      throw fail('BLOCKED_TARGET', 'Akses jaringan privat diblokir.');
    if (error.name === 'TimeoutError')
      throw fail(
        'SCREENSHOT_TIMEOUT',
        'Website melewati batas waktu screenshot.',
      );
    throw fail('SCREENSHOT_FAILED', 'Website belum dapat diambil gambarnya.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    await close();
  }
}
module.exports = { screenshotWeb, readInput, options, profiles };

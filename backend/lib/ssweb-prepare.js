const fs = require('node:fs/promises');
const path = require('node:path');
const { prepareRuntime, browserOptions } = require('./ssweb-runtime');
async function prepareScreenshot() {
  const file = path.join(__dirname, '../data/ssweb-runtime-status.json');
  let browser;
  const record = async (value) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({ ...value, at: new Date().toISOString() }),
      { mode: 0o600 },
    );
  };
  try {
    await record({ ready: false, stage: 'preparing' });
    await prepareRuntime();
    const runtime = await browserOptions();
    browser = await runtime.chromium.launch({
      ...runtime.launch,
      timeout: 15000,
    });
    const page = await browser.newPage();
    await page.setContent('<html><body>RED API Screenshot</body></html>');
    const png = await page.screenshot({ timeout: 10000 });
    await record({
      ready: true,
      stage: 'ready',
      version: browser.version(),
      pngBytes: png.length,
    });
    console.log('[SSWEB] Chromium smoke check passed.');
  } catch (error) {
    await record({ ready: false, stage: 'unavailable', error: error.message.slice(0,6000), platform:process.platform, arch:process.arch, node:process.version }).catch(() => {});
    console.error(
      '[SSWEB] Screenshot runtime unavailable. Existing API remains online.',
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}
module.exports = { prepareScreenshot };

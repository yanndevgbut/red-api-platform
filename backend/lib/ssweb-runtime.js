const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '../ssweb-runtime');
const fromRuntime = createRequire(path.join(root, 'package.json'));
// The panel mounts /tmp as a small tmpfs. Keep browser extraction and profiles on its disk volume.
const workRoot = path.resolve(
  process.env.SSWEB_WORK_DIR || path.join(__dirname, '../data/ssweb-work'),
);
const browserVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
).dependencies['@sparticuz/chromium'];
const workDir = path.join(workRoot, 'chromium-' + browserVersion);
let workspaceReady = false;
try {
  fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
  process.env.TMPDIR = workDir;
  workspaceReady = true;
} catch {}
let preparing, binaryTask;
function available() {
  if (!workspaceReady) return false;
  try {
    const expected = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json')),
    ).dependencies;
    for (const [name, version] of Object.entries(expected)) {
      const actual = JSON.parse(
        fs.readFileSync(path.join(root, 'node_modules', name, 'package.json')),
      );
      if (actual.version !== version) return false;
    }
    return true;
  } catch {
    return false;
  }
}
function prepareRuntime() {
  if (!workspaceReady)
    return Promise.reject(new Error('Screenshot workspace is unavailable.'));
  if (available()) return Promise.resolve();
  if (!preparing)
    preparing = new Promise((resolve, reject) => {
      console.log(
        '[SSWEB] Preparing isolated browser dependencies. API remains online.',
      );
      const child = spawn(
        'npm',
        [
          'ci',
          '--prefix',
          root,
          '--ignore-scripts',
          '--omit=dev',
          '--no-audit',
          '--no-fund',
          '--cache',
          path.join(workRoot, 'npm-cache'),
        ],
        {
          stdio: ['ignore', 'ignore', 'pipe'],
          env: {
            PATH: process.env.PATH,
            TMPDIR: workDir,
            ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
            LANG: 'en_US.UTF-8',
            ...Object.fromEntries(
              [
                'HTTP_PROXY',
                'HTTPS_PROXY',
                'http_proxy',
                'https_proxy',
                'NO_PROXY',
                'no_proxy',
                'SSL_CERT_FILE',
                'NODE_EXTRA_CA_CERTS',
              ]
                .filter((key) => process.env[key])
                .map((key) => [key, process.env[key]]),
            ),
          },
        },
      );
      let diagnostic = '';
      child.stderr.on('data', (chunk) => {
        diagnostic = (diagnostic + chunk.toString()).slice(-5000);
      });
      const timeout = setTimeout(() => child.kill('SIGTERM'), 180000);
      timeout.unref();
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        if (code === 0 && available()) {
          console.log('[SSWEB] Browser dependencies ready.');
          resolve();
        } else
          reject(
            new Error(
              'Browser dependency installation failed (' +
                code +
                '): ' +
                diagnostic
                  .replace(
                    /(?:ghp_|github_pat_|ptl[ac]_)[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
                    '[REDACTED]',
                  )
                  .replace(/(https?:\/\/)[^/\s]+:[^@/\s]+@/g, '$1[REDACTED]@'),
            ),
          );
      });
    });
  return preparing;
}
async function browserOptions() {
  if (!available())
    throw Object.assign(new Error('Runtime screenshot belum siap.'), {
      code: 'BROWSER_UNAVAILABLE',
    });
  const { chromium, devices } = fromRuntime('playwright-core');
  if (!binaryTask)
    binaryTask = (async () => {
      const marker = path.join(workDir, '.extracted');
      if (!process.env.CHROME_PATH && !fs.existsSync(marker)) {
        fs.rmSync(workDir, { recursive: true, force: true });
        fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
      }
      const { default: bundle } = await import(
        pathToFileURL(fromRuntime.resolve('@sparticuz/chromium')).href
      );
      const executablePath =
        process.env.CHROME_PATH || (await bundle.executablePath());
      if (!process.env.CHROME_PATH)
        fs.writeFileSync(marker, browserVersion, { mode: 0o600 });
      return { bundle, executablePath };
    })();
  const { bundle, executablePath } = await binaryTask;
  const args = bundle.args.filter(
    (arg) =>
      ![
        '--disable-web-security',
        '--disable-site-isolation-trials',
        '--allow-running-insecure-content',
        '--in-process-gpu',
      ].includes(arg) &&
      !arg.startsWith('--disable-features=') &&
      !arg.startsWith('--enable-features=') &&
      !arg.startsWith('--proxy-') &&
      !arg.startsWith('--single-process') &&
      !arg.startsWith('--headless'),
  );
  return {
    chromium,
    devices,
    launch: {
      executablePath,
      headless: true,
      args: [
        ...args,
        '--disable-dev-shm-usage',
        '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--js-flags=--max-old-space-size=128',
      ],
      env: {
        PATH: process.env.PATH,
        TMPDIR: workDir,
        ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
        LANG: 'en_US.UTF-8',
        TZ: 'UTC',
        ...(process.env.LD_LIBRARY_PATH
          ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH }
          : {}),
        ...(process.env.FONTCONFIG_PATH
          ? { FONTCONFIG_PATH: process.env.FONTCONFIG_PATH }
          : {}),
      },
    },
  };
}
function ready() {
  try {
    return (
      available() &&
      JSON.parse(
        fs.readFileSync(
          path.join(__dirname, '../data/ssweb-runtime-status.json'),
          'utf8',
        ),
      ).ready === true
    );
  } catch {
    return false;
  }
}
module.exports = {
  available,
  ready,
  prepareRuntime,
  browserOptions,
  fromRuntime,
};

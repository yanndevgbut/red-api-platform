const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawn } = require("node:child_process");
const root = path.join(__dirname, "../hd-runtime");
const isolated = createRequire(path.join(root, "package.json"));
let ready = false,
  preparing;
function sharp() {
  return isolated("sharp");
}
async function smoke() {
  const lib = sharp();
  if (lib.versions.sharp !== "0.35.5")
    throw new Error("HD dependency version mismatch");
  await lib({
    create: { width: 1, height: 1, channels: 3, background: "#000" },
  })
    .png()
    .toBuffer();
}
function prepareHD() {
  if (!preparing)
    preparing = (async () => {
      try {
        await smoke();
      } catch {
        const cache = path.join(__dirname, "../data/hd-work/npm-cache");
        fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
        const env = Object.fromEntries(
          [
            "PATH",
            "HOME",
            "TMPDIR",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "http_proxy",
            "https_proxy",
            "NO_PROXY",
            "no_proxy",
            "SSL_CERT_FILE",
            "NODE_EXTRA_CA_CERTS",
          ]
            .filter((k) => process.env[k])
            .map((k) => [k, process.env[k]]),
        );
        await new Promise((resolve, reject) => {
          const child = spawn(
            "npm",
            [
              "ci",
              "--prefix",
              root,
              "--ignore-scripts",
              "--omit=dev",
              "--no-audit",
              "--no-fund",
              "--cache",
              cache,
            ],
            { env, stdio: "ignore" },
          );
          const timer = setTimeout(() => child.kill("SIGTERM"), 180000);
          timer.unref();
          child.once("error", reject);
          child.once("close", (code) => {
            clearTimeout(timer);
            code === 0
              ? resolve()
              : reject(new Error("HD dependency installation failed"));
          });
        });
        await smoke();
      }
      ready = true;
      console.log("[HD] Image validation runtime ready.");
    })().catch(() => {
      console.error(
        "[HD] Image validation runtime unavailable. Restart to retry.",
      );
    });
  return preparing;
}
module.exports = { sharp, prepareHD, ready: () => ready };

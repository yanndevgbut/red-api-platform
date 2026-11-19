const { browserOptions, ready } = require("./ssweb-runtime");
const { startEgressProxy, validateURL } = require("./ssweb-egress");
const fail = (code, message) => Object.assign(new Error(message), { code });
let active = false;
async function browserProfile(
  username,
  {
    signal,
    browserFactory = browserOptions,
    proxyFactory = startEgressProxy,
    runtimeReady = ready,
  } = {},
) {
  signal ||= AbortSignal.timeout(30000);
  if (active)
    throw fail(
      "PROVIDER_BUSY",
      "Pengambilan profil TikTok sedang sibuk. Coba lagi sebentar.",
    );
  if (!runtimeReady())
    throw fail(
      "PROVIDER_UNAVAILABLE",
      "Runtime profil TikTok sedang disiapkan.",
    );
  active = true;
  let browser,
    proxy,
    closing = false,
    cleanup,
    task,
    rejectAbort;
  const close = () =>
    (cleanup ||= (async () => {
      closing = true;
      await browser?.close().catch(() => {});
      await proxy?.close().catch(() => {});
    })());
  const cancelled = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  const check = () => {
    if (closing || signal?.aborted)
      throw fail("PROVIDER_TIMEOUT", "Pengambilan profil TikTok dibatalkan.");
  };
  const abort = () => {
    rejectAbort(fail("PROVIDER_TIMEOUT", "Waktu tunggu Countik habis."));
    void close();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    check();
    return await Promise.race([
      cancelled,
      (task = (async () => {
        proxy = await proxyFactory();
        if (closing) {
          await proxy.close();
          check();
        }
        const runtime = await browserFactory();
        check();
        browser = await runtime.chromium.launch({
          ...runtime.launch,
          timeout: 10000,
          proxy: { server: proxy.url },
          args: [
            ...runtime.launch.args,
            "--proxy-bypass-list=<-loopback>",
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
          ],
        });
        if (closing) {
          await browser.close();
          check();
        }
        const context = await browser.newContext({
          serviceWorkers: "block",
          acceptDownloads: false,
        });
        await context.routeWebSocket(/.*/, (socket) => socket.close());
        await context.route("**/*", async (route) => {
          try {
            validateURL(route.request().url());
            await route.continue();
          } catch {
            await route.abort("blockedbyclient").catch(() => {});
          }
        });
        const page = await context.newPage();
        context.on("page", (popup) => {
          if (popup !== page) void popup.close();
        });
        page.on("dialog", (dialog) => void dialog.dismiss());
        page.on("download", (download) => void download.cancel());
        await page.goto("https://countik.com/", {
          waitUntil: "domcontentloaded",
          timeout: 12000,
        });
        await page
          .waitForLoadState("networkidle", { timeout: 3000 })
          .catch(() => {});
        if (new URL(page.url()).origin !== "https://countik.com")
          throw fail(
            "PROVIDER_BLOCKED",
            "Countik mengalihkan sesi ke alamat yang tidak didukung.",
          );
        const result = await page.evaluate(async (username) => {
          const response = await fetch(
            "/api/exist/" + encodeURIComponent(username),
            {
              redirect: "error",
              credentials: "same-origin",
              headers: { Accept: "application/json" },
            },
          );
          const reader = response.body?.getReader();
          const chunks = [];
          let size = 0;
          if (reader) {
            try {
              while (true) {
                const row = await reader.read();
                if (row.done) break;
                size += row.value.length;
                if (size > 1024 * 1024) {
                  await reader.cancel();
                  throw new Error("Response too large");
                }
                chunks.push(row.value);
              }
            } finally {
              reader.releaseLock();
            }
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          return {
            status: response.status,
            contentType: response.headers.get("content-type") || "",
            text: new TextDecoder().decode(bytes),
          };
        }, username);
        if (proxy.failure)
          throw fail(
            "PROVIDER_BLOCKED",
            "Koneksi browser Countik tidak tersedia.",
          );
        return new Response(result.text, {
          status: result.status,
          headers: { "content-type": result.contentType },
        });
      })()),
    ]);
  } finally {
    signal?.removeEventListener("abort", abort);
    await close();
    await task?.catch(() => {});
    active = false;
  }
}
module.exports = { browserProfile };

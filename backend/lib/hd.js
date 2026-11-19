const { browserOptions } = require("./ssweb-runtime");
const { validateURL, startEgressProxy } = require("./ssweb-egress");
const { validateImage, fail } = require("./hd-image");
async function upscaleImage(
  upload,
  scale,
  {
    signal,
    browserFactory = browserOptions,
    proxyFactory = startEgressProxy,
  } = {},
) {
  let browser,
    proxy,
    closed = false,
    cleanupTask,
    timer,
    task;
  const close = () =>
    (cleanupTask ||= (async () => {
      closed = true;
      await browser?.close().catch(() => {});
      await proxy?.close().catch(() => {});
    })());
  const check = () => {
    if (closed || signal?.aborted)
      throw fail("CANCELLED", "Permintaan dibatalkan.");
  };
  let rejectAbort;
  const cancellation = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    rejectAbort(fail("CANCELLED", "Permintaan dibatalkan."));
    void close();
  };
  if (signal?.aborted) throw fail("CANCELLED", "Permintaan dibatalkan.");
  signal?.addEventListener("abort", onAbort, { once: true });
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(fail("HD_TIMEOUT", "Proses HD melewati batas 180 detik."));
      void close();
    }, 180000);
    timer.unref();
  });
  const started = Date.now();
  try {
    const image = await Promise.race([
      deadline,
      cancellation,
      (task = (async () => {
        proxy = await proxyFactory({
          maxDownloadBytes: 180 * 1024 * 1024,
          maxUploadBytes: 16 * 1024 * 1024,
        });
        if (closed) {
          await proxy.close();
          check();
        }
        const runtime = await browserFactory();
        check();
        browser = await runtime.chromium.launch({
          ...runtime.launch,
          timeout: 15000,
          proxy: { server: proxy.url },
          args: [
            ...runtime.launch.args.filter(
              (arg) => !arg.startsWith("--js-flags="),
            ),
            "--js-flags=--max-old-space-size=384",
            "--proxy-bypass-list=<-loopback>",
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
          ],
        });
        if (closed) {
          await browser.close();
          check();
        }
        const context = await browser.newContext({
          acceptDownloads: true,
          serviceWorkers: "block",
        });
        await context.routeWebSocket(/.*/, (socket) => socket.close());
        await context.route("**/*", async (route) => {
          const raw = route.request().url();
          // Data/blob resources are in-memory images and model workers, never network targets.
          if (/^(data:|blob:)/.test(raw)) return route.continue();
          try {
            validateURL(raw);
            if (
              /googlesyndication|doubleclick|google-analytics|googletagmanager/.test(
                new URL(raw).hostname,
              )
            )
              return route.abort();
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
        page.setDefaultTimeout(45000);
        const response = await page.goto(
          "https://freeupscaler.app/image-upscaler",
          { waitUntil: "load", timeout: 45000 },
        );
        if (response?.status() >= 400)
          throw fail("PROVIDER_UNAVAILABLE", "Layanan HD belum tersedia.");
        await page.waitForFunction(
          () => {
            const el = document.querySelector("input[type=file]");
            return (
              el &&
              Object.keys(el).some(
                (k) =>
                  k.startsWith("__reactProps$") &&
                  typeof el[k]?.onChange === "function",
              )
            );
          },
          null,
          { timeout: 45000 },
        );
        await page
          .locator("input[type=file]")
          .first()
          .setInputFiles({
            name: upload.name,
            mimeType: upload.mimeType,
            buffer: upload.buffer,
          });
        await page
          .getByRole("radio", { name: `${scale}x`, exact: true })
          .click();
        await page.getByRole("radio", { name: "PNG", exact: true }).click();
        await page
          .getByRole("button", { name: `Upscale ${scale}x`, exact: true })
          .click();
        const button = page.getByRole("button", {
          name: "Download",
          exact: true,
        });
        await button.waitFor({ state: "visible", timeout: 180000 });
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 30000 }),
          button.click(),
        ]);
        const stream = await download.createReadStream();
        if (!stream)
          throw fail("INVALID_RESULT", "Berkas hasil tidak tersedia.");
        const chunks = [];
        let size = 0;
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > 64 * 1024 * 1024) {
            stream.destroy();
            throw fail("RESULT_TOO_LARGE", "Hasil melebihi batas 64 MB.");
          }
          chunks.push(chunk);
        }
        if (proxy.failure)
          throw fail("TRANSFER_LIMIT", "Layanan HD melewati batas transfer.");
        return Buffer.concat(chunks);
      })()),
    ]);
    await close();
    checkNotAborted(signal);
    if (
      image.length < 24 ||
      image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    )
      throw fail("INVALID_RESULT", "Hasil bukan PNG.");
    const dimensions = await validateImage(image, scale, { output: true });
    if (
      dimensions.width !== upload.width * scale ||
      dimensions.height !== upload.height * scale
    )
      throw fail(
        "INVALID_RESULT",
        "Ukuran hasil tidak sesuai skala yang diminta.",
      );
    return {
      buffer: image,
      provider: "freeupscaler.app",
      scale_requested: scale,
      scale_actual: { x: scale, y: scale },
      input: { width: upload.width, height: upload.height },
      elapsed_seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      image: {
        filename: `red-api-hd-${scale}x.png`,
        mime_type: "image/png",
        width: dimensions.width,
        height: dimensions.height,
        size_bytes: image.length,
      },
    };
  } catch (error) {
    if (
      [
        "CANCELLED",
        "HD_TIMEOUT",
        "INVALID_RESULT",
        "RESULT_TOO_LARGE",
        "TRANSFER_LIMIT",
        "PROVIDER_UNAVAILABLE",
      ].includes(error.code)
    )
      throw error;
    if (error.name === "TimeoutError")
      throw fail("HD_TIMEOUT", "Layanan HD melewati batas waktu.");
    throw fail(
      "UPSCALE_FAILED",
      "Gambar belum dapat diproses. Coba lagi nanti.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    await close();
    await task?.catch(() => {});
  }
}
function checkNotAborted(signal) {
  if (signal?.aborted) throw fail("CANCELLED", "Permintaan dibatalkan.");
}
module.exports = { upscaleImage };

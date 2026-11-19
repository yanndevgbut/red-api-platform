const supabase = require("../config/supabase");
const runtime = require("../lib/hd-runtime");
const browserRuntime = require("../lib/ssweb-runtime");
const { readInput, fetchImage, validateImage } = require("../lib/hd-image");
const { upscaleImage } = require("../lib/hd");
const results = require("../lib/hd-results");
const { ensureEntitlement } = require("../lib/billing");
const { createJsonHandler } = require("../lib/json-response");
let active = 0;
const reject = (res, status, code, message) =>
  res.status(status).json({ success: false, error: { code, message } });
function mapError(error) {
  const code = typeof error.code === "string" ? error.code : "UPSCALE_FAILED";
  const status = [
    "BLOCKED_TARGET",
    "INVALID_SCALE",
    "INVALID_IMAGE",
    "IMAGE_TOO_LARGE",
  ].includes(code)
    ? 400
    : code === "HD_TIMEOUT"
      ? 504
      : code === "HD_STORAGE_FULL"
        ? 503
        : 502;
  const known = [
    "BLOCKED_TARGET",
    "INVALID_SCALE",
    "INVALID_IMAGE",
    "IMAGE_TOO_LARGE",
    "IMAGE_FETCH_FAILED",
    "HD_TIMEOUT",
    "HD_STORAGE_FULL",
    "UPSCALE_FAILED",
    "PROVIDER_UNAVAILABLE",
    "INVALID_RESULT",
    "RESULT_TOO_LARGE",
    "TRANSFER_LIMIT",
    "CANCELLED",
  ];
  return {
    status,
    body: {
      success: false,
      error: {
        code: known.includes(code) ? code : "UPSCALE_FAILED",
        message: known.includes(code)
          ? error.message
          : "Gambar belum dapat diproses. Coba lagi nanti.",
      },
    },
  };
}
module.exports = (router, authorize) => {
  router.get(
    "/hd",
    async (req, res, next) => {
      let release;
      try {
        const key = req.get("x-api-key") || req.query.apikey;
        if (
          typeof key !== "string" ||
          !/^[a-z0-9_-]{1,128}$/i.test(key) ||
          (req.query.apikey !== undefined &&
            (typeof req.query.apikey !== "string" ||
              (req.get("x-api-key") &&
                req.query.apikey !== req.get("x-api-key"))))
        )
          return reject(
            res,
            401,
            "INVALID_KEY",
            "Gunakan satu API key aktif melalui header x-api-key.",
          );
        const account = await supabase
          .from("api_keys")
          .select("user_id")
          .eq("key", key)
          .eq("is_active", true)
          .maybeSingle();
        if (res.destroyed || res.writableEnded) return;
        if (account.error)
          return reject(
            res,
            503,
            "AUTH_UNAVAILABLE",
            "Autentikasi belum tersedia.",
          );
        if (!account.data)
          return reject(
            res,
            401,
            "INVALID_KEY",
            "API key tidak valid atau sudah dicabut.",
          );
        const owner = account.data.user_id;
        const profile = await supabase
          .from("profiles")
          .select("banned")
          .eq("id", owner)
          .maybeSingle();
        if (res.destroyed || res.writableEnded) return;
        if (profile.error)
          return reject(
            res,
            503,
            "AUTH_UNAVAILABLE",
            "Status akun belum dapat diverifikasi.",
          );
        if (!profile.data || profile.data.banned !== false)
          return reject(res, 403, "ACCOUNT_BLOCKED", "Akun tidak aktif.");
        await ensureEntitlement(owner);
        if (res.destroyed || res.writableEnded) return;
        if (req.query.result !== undefined) {
          const result = await results.get(owner, req.query.result);
          if (!result)
            return reject(
              res,
              404,
              "RESULT_NOT_FOUND",
              "Hasil tidak ditemukan atau sudah kedaluwarsa.",
            );
          res.set({
            "Cache-Control": "private, no-store",
            "Content-Type": "image/png",
            "Content-Disposition": 'inline; filename="red-api-hd.png"',
            "X-Content-Type-Options": "nosniff",
          });
          return res.sendFile(result.file, (error) => {
            if (error && !res.headersSent && !res.destroyed)
              reject(res, 404, "RESULT_NOT_FOUND", "Hasil tidak tersedia.");
          });
        }
        req.hdInput = readInput(req.query);
        if (!runtime.ready() || !browserRuntime.ready())
          return reject(
            res,
            503,
            "HD_UNAVAILABLE",
            "Runtime HD sedang disiapkan. Coba lagi sebentar.",
          );
        if (active >= 1) {
          res.set("Retry-After", "10");
          return reject(
            res,
            503,
            "HD_BUSY",
            "Gambar HD lain sedang diproses. Coba lagi sebentar.",
          );
        }
        active++;
        let released = false;
        release = () => {
          if (!released) {
            released = true;
            active--;
          }
        };
        req.hdRelease = release;
        const controller = new AbortController();
        const onClose = () => {
          if (!req.hdStarted) controller.abort();
        };
        const onFinish = () => {
          if (!req.hdStarted) release();
        };
        res.once("close", onClose);
        res.once("finish", onFinish);
        try {
          await results.preflight();
          const buffer = await fetchImage(req.hdInput.url, {
            signal: controller.signal,
          });
          const meta = await validateImage(buffer, req.hdInput.scale);
          if (res.destroyed || res.writableEnded) {
            release();
            return;
          }
          req.hdUpload = { ...meta, buffer };
          req.hdOwner = owner;
        } finally {
          res.off("close", onClose);
        }
        // Keep the reservation until authorization fails, a disconnect occurs, or processing ends.
        const beforeWork = () => {
          if (!req.hdStarted) release();
        };
        res.once("close", beforeWork);
        if (res.destroyed || res.writableEnded) {
          release();
          return;
        }
        next();
      } catch (error) {
        release?.();
        if (!res.destroyed && !res.writableEnded) {
          const mapped = mapError(error);
          res.status(mapped.status).json(mapped.body);
        }
      }
    },
    authorize,
    createJsonHandler({
      work: async (req, signal) => {
        req.hdStarted = true;
        try {
          const result = await upscaleImage(req.hdUpload, req.hdInput.scale, {
            signal,
          });
          signal.throwIfAborted();
          return await results.save(req.hdOwner, result);
        } finally {
          req.hdUpload = null;
          req.hdRelease();
        }
      },
      mapError,
    }),
  );
};

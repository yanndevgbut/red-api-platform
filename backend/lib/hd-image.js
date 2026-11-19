const http = require("node:http");
const https = require("node:https");
const { validateURL, resolvePublic } = require("./ssweb-egress");
const { sharp } = require("./hd-runtime");
const fail = (code, message) => Object.assign(new Error(message), { code });
const MAX_INPUT = 10 * 1024 * 1024,
  MAX_PIXELS = 16777216;
function readInput(query) {
  const url = validateURL(query.url);
  const scale =
    query.scale === undefined || query.scale === ""
      ? 4
      : query.scale === "2"
        ? 2
        : query.scale === "4"
          ? 4
          : 0;
  if (!scale) throw fail("INVALID_SCALE", "Pilihan skala: 2 atau 4.");
  return { url: url.href, scale };
}
async function fetchImage(
  input,
  { signal, resolve = resolvePublic, requestImpl } = {},
) {
  const deadline = AbortSignal.timeout(30000);
  signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let url = validateURL(input);
  for (let hop = 0; hop < 6; hop++) {
    signal.throwIfAborted();
    const target = await resolve(url.hostname);
    const response = await new Promise((accept, reject) => {
      const req = (
        requestImpl ||
        (url.protocol === "https:" ? https.request : http.request)
      )(
        {
          protocol: url.protocol,
          hostname: target.address,
          family: target.family,
          port: url.protocol === "https:" ? 443 : 80,
          servername: url.hostname.replace(/^\[|\]$/g, ""),
          path: url.pathname + url.search,
          method: "GET",
          agent: false,
          signal,
          headers: {
            Host: url.host,
            Accept: "image/png,image/jpeg,image/webp",
            "Accept-Encoding": "identity",
            "User-Agent": "RED-API/1.0",
          },
        },
        accept,
      );
      req.once("error", reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      const location = response.headers.location;
      response.destroy();
      if (!location)
        throw fail("IMAGE_FETCH_FAILED", "Redirect gambar tidak valid.");
      url = validateURL(new URL(location, url).href);
      continue;
    }
    if (response.statusCode !== 200) {
      response.destroy();
      throw fail("IMAGE_FETCH_FAILED", "Gambar belum dapat diunduh.");
    }
    if (Number(response.headers["content-length"]) > MAX_INPUT) {
      response.destroy();
      throw fail("IMAGE_TOO_LARGE", "Ukuran maksimum gambar 10 MB.");
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of response) {
      size += chunk.length;
      if (size > MAX_INPUT) {
        response.destroy();
        throw fail("IMAGE_TOO_LARGE", "Ukuran maksimum gambar 10 MB.");
      }
      chunks.push(chunk);
    }
    if (!size) throw fail("INVALID_IMAGE", "Gambar kosong.");
    return Buffer.concat(chunks);
  }
  throw fail("IMAGE_FETCH_FAILED", "Terlalu banyak redirect gambar.");
}
async function validateImage(bytes, scale, { output = false } = {}) {
  try {
    const limit = output
      ? MAX_PIXELS
      : Math.floor(MAX_PIXELS / (scale * scale));
    const decoder = sharp()(bytes, {
      limitInputPixels: limit,
      failOn: "warning",
      animated: false,
    });
    const meta = await decoder.metadata();
    if (
      !["png", "jpeg", "webp"].includes(meta.format) ||
      (meta.pages || 1) !== 1 ||
      !meta.width ||
      !meta.height ||
      meta.width * meta.height > limit ||
      meta.width * (output ? 1 : scale) > 8192 ||
      meta.height * (output ? 1 : scale) > 8192
    )
      throw new Error("dimensions");
    // Fully decode before handing an untrusted image to the browser.
    await decoder.stats();
    const rotated = !output && [5, 6, 7, 8].includes(meta.orientation);
    return {
      width: rotated ? meta.height : meta.width,
      height: rotated ? meta.width : meta.height,
      mimeType: "image/" + meta.format,
      name: "input." + (meta.format === "jpeg" ? "jpg" : meta.format),
    };
  } catch {
    throw fail(
      output ? "INVALID_RESULT" : "INVALID_IMAGE",
      output
        ? "Hasil PNG tidak valid."
        : "Gunakan PNG, JPEG, atau WebP statis. Maksimum hasil 16 megapiksel dan sisi 8192 px; kurangi ukuran gambar atau gunakan 2x.",
    );
  }
}
module.exports = { readInput, fetchImage, validateImage, fail };

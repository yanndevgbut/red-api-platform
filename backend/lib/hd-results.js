const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { fail } = require("./hd-image");
const TTL = 10 * 60 * 1000,
  MAX = 512 * 1024 * 1024,
  RESERVE = 64 * 1024 * 1024;
const validId = (id) =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    id,
  );
function createStore(root = path.join(__dirname, "../data/hd-results")) {
  let sweeping;
  async function sweep() {
    if (sweeping) return sweeping;
    sweeping = (async () => {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      const names = await fs.readdir(root);
      let size = 0,
        count = 0;
      for (const name of names) {
        if (!/^[0-9a-f-]+\.(?:json|png|tmp)$/.test(name)) continue;
        const file = path.join(root, name);
        let stat;
        try {
          stat = await fs.stat(file);
        } catch {
          continue;
        }
        if (Date.now() - stat.mtimeMs >= TTL) {
          await fs.unlink(file).catch(() => {});
          continue;
        }
        size += stat.size;
        if (name.endsWith(".json")) count++;
      }
      return { size, count };
    })().finally(() => {
      sweeping = null;
    });
    return sweeping;
  }
  async function preflight() {
    const info = await sweep();
    if (info.size + RESERVE > MAX || info.count >= 64)
      throw fail(
        "HD_STORAGE_FULL",
        "Penyimpanan hasil HD penuh. Coba lagi setelah beberapa menit.",
      );
  }
  async function save(owner, result) {
    const id = randomUUID(),
      expires = Date.now() + TTL;
    const imageFile = path.join(root, id + ".png"),
      metaFile = path.join(root, id + ".json"),
      temporary = path.join(root, id + ".tmp");
    try {
      await fs.writeFile(temporary, result.buffer, { mode: 0o600, flag: "wx" });
      await fs.rename(temporary, imageFile);
      await fs.writeFile(
        metaFile,
        JSON.stringify({ owner, expires, size: result.buffer.length }),
        { mode: 0o600, flag: "wx" },
      );
    } catch (error) {
      await Promise.all(
        [temporary, imageFile, metaFile].map((file) =>
          fs.unlink(file).catch(() => {}),
        ),
      );
      throw error;
    }
    const { buffer, ...data } = result;
    return {
      ...data,
      image: {
        ...data.image,
        encoding: buffer.length <= 3 * 1024 * 1024 ? "base64" : "url",
        ...(buffer.length <= 3 * 1024 * 1024
          ? { base64: buffer.toString("base64") }
          : {}),
        url: `https://api.redapi.my.id/api/tools/hd?result=${id}`,
        expires_at: new Date(expires).toISOString(),
      },
    };
  }
  async function get(owner, id) {
    if (!validId(id)) return null;
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(root, id + ".json"), "utf8"),
      );
      if (meta.owner !== owner || meta.expires <= Date.now()) return null;
      const file = path.join(root, id + ".png"),
        stat = await fs.stat(file);
      if (stat.size !== meta.size || stat.size > RESERVE) return null;
      return { file, size: stat.size };
    } catch {
      return null;
    }
  }
  const timer = setInterval(() => void sweep().catch(() => {}), 60000);
  timer.unref();
  return { sweep, preflight, save, get, close: () => clearInterval(timer) };
}
const store = createStore();
module.exports = { ...store, createStore, validId };

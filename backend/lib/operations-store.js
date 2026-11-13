const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const file =
  process.env.OPERATIONS_FILE ||
  path.join(__dirname, '../data/operations.json');
const uploads =
  process.env.PORTAL_UPLOAD_DIR || path.join(path.dirname(file), 'uploads');
let tail = Promise.resolve();
function withOperations(action) {
  const run = async () => {
    let state;
    try {
      state = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = {
        version: 1,
        announcements: [],
        orders: [],
        subscriptions: {},
        audit: [],
        qris: null,
      };
    }
    if (
      !state ||
      state.version !== 1 ||
      !Array.isArray(state.announcements) ||
      !Array.isArray(state.orders) ||
      !state.subscriptions ||
      !Array.isArray(state.audit)
    )
      throw new Error('Invalid operations store');
    const save = async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = file + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify(state) + '\n', {
          flag: 'wx',
          mode: 0o600,
        });
        await fs.rename(temporary, file);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    };
    return action(state, save);
  };
  const result = tail.then(run, run);
  tail = result.catch(() => {});
  return result;
}
function imageData(data) {
  if (typeof data !== 'string' || data.length > 4200000)
    throw new Error('Image exceeds limit');
  const match = data.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Use PNG or JPEG');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 3 * 1024 * 1024 || bytes.length < 24)
    throw new Error('Invalid image size');
  let width, height;
  if (
    match[1] === 'png' &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString('ascii', 12, 16) === 'IHDR'
  ) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  }
  if (match[1] === 'jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let pos = 2;
    while (pos + 9 < bytes.length) {
      if (bytes[pos++] !== 255) break;
      while (bytes[pos] === 255) pos++;
      const marker = bytes[pos++];
      if (marker === 217 || marker === 218) break;
      if (pos + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(pos);
      if (length < 2 || pos + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        height = bytes.readUInt16BE(pos + 3);
        width = bytes.readUInt16BE(pos + 5);
        break;
      }
      pos += length;
    }
  }
  if (
    !width ||
    !height ||
    width > 8000 ||
    height > 8000 ||
    width * height > 25000000
  )
    throw new Error('Invalid image dimensions');
  return { bytes, ext: match[1] === 'png' ? 'png' : 'jpg' };
}
async function saveImage(data) {
  const { bytes, ext } = imageData(data);
  await fs.mkdir(uploads, { recursive: true });
  const name = randomUUID() + '.' + ext;
  await fs.writeFile(path.join(uploads, name), bytes, {
    flag: 'wx',
    mode: 0o600,
  });
  return name;
}
async function readImage(name) {
  if (typeof name !== 'string' || !/^[a-f0-9-]{36}\.(png|jpg)$/.test(name))
    throw new Error('Invalid image');
  return {
    bytes: await fs.readFile(path.join(uploads, name)),
    type: name.endsWith('.png') ? 'image/png' : 'image/jpeg',
  };
}
async function removeImage(name) {
  if (typeof name === 'string' && /^[a-f0-9-]{36}\.(png|jpg)$/.test(name))
    await fs.rm(path.join(uploads, name), { force: true });
}
module.exports = {
  withOperations,
  saveImage,
  readImage,
  removeImage,
  imageData,
};

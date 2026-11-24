const fs = require('node:fs/promises');
const path = require('node:path');

const directory = process.env.HANDOFF_DIR || path.join(__dirname, '../data/handoff');
const documents = Object.freeze({
  guide: 'RED-API-HANDOFF.md',
  credentials: 'RED-API-KREDENSIAL.md',
});

async function getOwner() {
  try {
    const id = (await fs.readFile(path.join(directory, 'owner-id'), 'utf8')).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function readDocument(name) {
  if (!Object.values(documents).includes(name)) return null;
  return fs.readFile(path.join(directory, name), 'utf8');
}

module.exports = { documents, getOwner, readDocument };

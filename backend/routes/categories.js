const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const supabase = require('../config/supabase');

const router = express.Router();
const store = process.env.CATEGORIES_FILE || path.join(__dirname, '../data/categories.json');
let writes = Promise.resolve();
const normalize = name => typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
const valid = name => name.length > 0 && name.length <= 60 && name.toLowerCase() !== 'all' && !/[\u0000-\u001f\u007f]/.test(name);

async function readCategories() {
  try {
    const names = JSON.parse(await fs.readFile(store, 'utf8'));
    if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && valid(name))) throw new Error('Invalid category store');
    return names;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

router.get('/system/categories', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json({ categories: await readCategories() }); }
  catch { res.status(503).json({ error: 'Kategori belum dapat dimuat.' }); }
});

router.post('/admin/categories', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = req.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 8192) return res.status(401).json({ error: 'Login diperlukan.' });
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Sesi tidak valid.' });
    const profile = await supabase.from('profiles').select('role,banned').eq('id', user.id).maybeSingle();
    if (profile.error) return res.status(503).json({ error: 'Verifikasi administrator belum tersedia.' });
    if (profile.data?.role !== 'admin' || profile.data?.banned !== false) return res.status(403).json({ error: 'Administrator aktif diperlukan.' });
    req.apiUser = { id: user.id };
    const name = normalize(req.body?.name);
    if (!valid(name)) return res.status(400).json({ error: 'Nama kategori harus 1–60 karakter. ALL adalah filter bawaan.' });

    // Serialize writes, then atomically replace the store so concurrent additions are preserved.
    const task = async () => {
      const names = await readCategories();
      if (names.some(value => value.toLowerCase() === name.toLowerCase())) return null;
      const updated = [...names, name];
      await fs.mkdir(path.dirname(store), { recursive: true });
      const temporary = `${store}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify(updated, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, store);
      } finally { await fs.rm(temporary, { force: true }); }
      return updated;
    };
    const result = writes.then(task, task);
    writes = result.catch(() => {});
    const names = await result;
    if (!names) return res.status(409).json({ error: 'Kategori tersebut sudah tersedia.' });
    return res.status(201).json({ categories: names });
  } catch {
    return res.status(503).json({ error: 'Kategori belum dapat disimpan.' });
  }
});

module.exports = router;

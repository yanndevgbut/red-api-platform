const express = require('express');
const supabase = require('../config/supabase');
const requireAdmin = require('../middleware/admin-session');
const { readCategories } = require('./categories');
const { setMaintenance } = require('../lib/maintenance-state');
const { clearManagedPlan, queueUserCleanup, cleanupUser } = require('../lib/billing');
const router = express.Router();
const profileFields = 'id,username,email,role,plan,limit_daily,limit_remaining,banned,created_at';
const plans = { free: 100, basic: 3000, vip: 15000, enterprise: 999999 };
const fail = (res, status, error) => res.status(status).json({ error });
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
router.use(requireAdmin);
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

router.get('/endpoints', async (_req, res) => {
  const result = await supabase.from('endpoints').select('*').order('id').limit(1000);
  if (result.error) return fail(res, 503, 'Katalog tidak dapat dimuat.');
  return res.json(result.data);
});
router.post('/endpoints', async (req, res) => {
  const { name, category, method, path, description, min_plan } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || typeof category !== 'string' || category.length > 60 || !['GET', 'POST'].includes(method) || typeof path !== 'string' || !/^\/api\/(ai|download|stalk|tools|whatsapp)\/[a-z0-9_-]+$/.test(path) || path.length > 180 || typeof description !== 'string' || description.length > 2000 || !Object.hasOwn(plans, min_plan)) return fail(res, 400, 'Data endpoint tidak valid.');
  try { if (!(await readCategories()).includes(category)) return fail(res, 400, 'Kategori tidak tersedia.'); }
  catch { return fail(res, 503, 'Kategori belum tersedia.'); }
  const result = await supabase.from('endpoints').insert({ name: name.trim(), category, method, path, description, min_plan, status: 'active', params: [] }).select().single();
  if (result.error) return fail(res, result.error.code === '23505' ? 409 : 503, 'Endpoint tidak dapat ditambahkan.');
  return res.status(201).json(result.data);
});
router.delete('/endpoints/:id', async (req, res) => {
  if (req.get('x-confirm-action') !== 'delete-endpoint') return fail(res, 400, 'Konfirmasi diperlukan.');
  if (!/^[1-9]\d{0,9}$/.test(req.params.id) || Number(req.params.id) > 2147483647) return fail(res, 400, 'ID endpoint tidak valid.');
  const result = await supabase.from('endpoints').delete().eq('id', Number(req.params.id)).select('id');
  if (result.error) return fail(res, 503, 'Endpoint tidak dapat dihapus.');
  return result.data?.length ? res.json({ deleted: true }) : fail(res, 404, 'Endpoint tidak ditemukan.');
});
router.get('/users', async (_req, res) => {
  const result = await supabase.from('profiles').select(profileFields).order('created_at', { ascending: false }).limit(200);
  return result.error ? fail(res, 503, 'Pengguna tidak dapat dimuat.') : res.json(result.data);
});
router.patch('/users/:id', async (req, res) => {
  const body = req.body ?? {};
  if (!uuid(req.params.id) || !Object.keys(body).length || Object.keys(body).some(key => !['role', 'plan', 'banned'].includes(key)) || ('role' in body && !['user', 'admin'].includes(body.role)) || ('plan' in body && !Object.hasOwn(plans, body.plan)) || ('banned' in body && typeof body.banned !== 'boolean')) return fail(res, 400, 'Perubahan pengguna tidak valid.');
  if (req.get('x-confirm-action') !== 'update-user') return fail(res, 400, 'Konfirmasi diperlukan.');
  if (req.params.id === req.apiUser.id && ('role' in body || body.banned === true)) return fail(res, 403, 'Anda tidak dapat mencabut akses admin sendiri.');
  const changes = { ...body, updated_at: new Date().toISOString() };
  if (body.plan) changes.limit_daily = plans[body.plan];
  const result = await supabase.from('profiles').update(changes).eq('id', req.params.id).select(profileFields).maybeSingle();
  if (result.error) return fail(res, 503, 'Pengguna tidak dapat diperbarui.');
  if (result.data && body.plan) { try { await clearManagedPlan(req.params.id); } catch { return fail(res,503,'Status langganan belum tersinkronisasi. Coba lagi.'); } }
  return result.data ? res.json(result.data) : fail(res, 404, 'Pengguna tidak ditemukan.');
});
router.delete('/users/:id', async (req, res) => {
  if (!uuid(req.params.id)) return fail(res,400,'ID pengguna tidak valid.');
  if (req.get('x-confirm-action') !== 'delete-user') return fail(res,400,'Konfirmasi diperlukan.');
  if (req.params.id === req.apiUser.id) return fail(res,403,'Akun sendiri tidak dapat dihapus.');
  const profile = await supabase.from('profiles').select('id,role,email').eq('id',req.params.id).maybeSingle();
  if (profile.error) return fail(res,503,'Pengguna belum dapat diverifikasi.');
  if (!profile.data) return fail(res,404,'Pengguna tidak ditemukan.');
  if (profile.data.role === 'admin') return fail(res,403,'Akun admin dilindungi.');
  if (req.get('x-confirm-target') !== profile.data.email) return fail(res,400,'Konfirmasi email tidak cocok.');
  try { await queueUserCleanup(req.params.id); } catch { return fail(res,503,'Penghapusan belum dapat disiapkan.'); }
  const result = await supabase.auth.admin.deleteUser(req.params.id);
  if (result.error) return fail(res,503,'Akun tidak dapat dihapus. Silakan coba lagi.');
  try { await cleanupUser(req.params.id); } catch { /* Durable cleanup queue is retried by the reconciler. */ }
  return res.json({deleted:true});
});
router.get('/logs', async (_req, res) => {
  const result = await supabase.from('api_logs').select('id,user_id,ip_address,method,endpoint_path,status_code,latency_ms,created_at').order('id', { ascending: false }).limit(25);
  return result.error ? fail(res, 503, 'Log tidak dapat dimuat.') : res.json(result.data);
});
router.get('/system', async (_req, res) => {
  const result = await supabase.from('system_settings').select('maintenance_mode,maintenance_message,updated_at').eq('id', 1).single();
  return result.error ? fail(res, 503, 'Pengaturan tidak dapat dimuat.') : res.json(result.data);
});
router.post('/maintenance', async (req, res) => {
  if (req.get('x-confirm-action') !== 'maintenance') return fail(res,400,'Konfirmasi diperlukan.');
  const { active, message } = req.body ?? {};
  if (typeof active !== 'boolean' || (message !== undefined && (typeof message !== 'string' || message.length > 500))) return fail(res, 400, 'Pengaturan tidak valid.');
  const result = await supabase.from('system_settings').update({ maintenance_mode: active, maintenance_message: message || 'System under scheduled maintenance.', updated_at: new Date().toISOString() }).eq('id', 1).select('maintenance_mode,maintenance_message,updated_at').single();
  if (!result.error) setMaintenance(result.data);
  return result.error ? fail(res, 503, 'Pengaturan tidak dapat diperbarui.') : res.json(result.data);
});
module.exports = router;

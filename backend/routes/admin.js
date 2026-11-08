const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { readApiKey } = require('../middleware/auth');
const { rejectRequest } = require('../middleware/validate');

// Middleware to check admin role
async function requireAdmin(req, res, next) {
  const apiKey = readApiKey(req);
  if (!apiKey) return rejectRequest(res, 401, 'Admin API key missing.');

  const { data, error } = await supabase
    .from('api_keys')
    .select('user_id, profiles!inner(role, banned)')
    .eq('key', apiKey)
    .eq('is_active', true)
    .maybeSingle();

  if (error) return rejectRequest(res, 503, 'Authentication service unavailable.');
  if (data?.profiles?.role !== 'admin' || data.profiles.banned !== false) {
    return rejectRequest(res, 403, 'Active administrator required.');
  }
  req.apiUser = { id: data.user_id };

  next();
}

// GET /api/admin/system
router.get('/system', requireAdmin, async (req, res) => {
  const [settings, users, endpoints] = await Promise.all([
    supabase.from('system_settings').select('*').eq('id', 1).single(),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('endpoints').select('id', { count: 'exact', head: true }),
  ]);
  if (settings.error || users.error || endpoints.error) return rejectRequest(res, 503, 'System data unavailable.');
  res.json({ status: true, settings: settings.data, total_users: users.count, total_endpoints: endpoints.count });
});

// POST /api/admin/maintenance
router.post('/maintenance', requireAdmin, async (req, res) => {
  const { active, message } = req.body ?? {};
  if (typeof active !== 'boolean' || (message !== undefined && (typeof message !== 'string' || message.length > 500))) {
    return rejectRequest(res, 400, 'Provide a boolean active flag and an optional message of up to 500 characters.');
  }

  const { data, error } = await supabase
    .from('system_settings')
    .update({
      maintenance_mode: active,
      maintenance_message: message || 'System under scheduled maintenance.',
      updated_at: new Date().toISOString()
    })
    .eq('id', 1)
    .select()
    .single();

  if (error) {
    return rejectRequest(res, 503, 'Could not update maintenance mode.');
  }

  res.json({ status: true, message: 'Maintenance mode updated', settings: data });
});

module.exports = router;

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
module.exports = token => createClient(config.supabaseUrl, config.supabaseKey, {
  global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
  auth: { persistSession: false, autoRefreshToken: false },
});

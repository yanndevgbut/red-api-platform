const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  global: {
    fetch: (input, init) => {
      const timeout = AbortSignal.timeout(5000);
      const signal = init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout;
      return fetch(input, { ...init, signal });
    }
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

module.exports = supabase;

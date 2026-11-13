const supabase = require('../config/supabase');
let cached = null,
  fetchedAt = 0,
  pending,
  generation = 0;
function setMaintenance(settings) {
  generation++;
  cached = {
    active: settings.maintenance_mode === true,
    message:
      settings.maintenance_message || 'Layanan sedang dalam pemeliharaan.',
  };
  fetchedAt = Date.now();
}
async function getMaintenance() {
  if (cached && Date.now() - fetchedAt < 5000) return cached;
  if (!pending) {
    const version = generation;
    pending = (async () => {
      const result = await supabase
        .from('system_settings')
        .select('maintenance_mode,maintenance_message')
        .eq('id', 1)
        .single();
      if (
        result.error ||
        !result.data ||
        typeof result.data.maintenance_mode !== 'boolean'
      )
        throw new Error('Maintenance status unavailable');
      if (generation === version) setMaintenance(result.data);
      return cached;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}
module.exports = { getMaintenance, setMaintenance };

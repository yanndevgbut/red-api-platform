const { randomBytes, randomUUID } = require('node:crypto');
const columns = 'id,user_id,key,is_active,created_at';

module.exports = async function rotateApiKey(service, userClient, userId) {
  const rpc = await userClient.rpc('rotate_my_api_key');
  if (!rpc.error) {
    const current = await service.from('api_keys').select(columns).eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
    if (current.error || !current.data) throw new Error('Rotated key unavailable');
    return current.data;
  }
  // Do not bypass a database authorization failure. Only a missing RPC enables compatibility mode.
  if (rpc.error.code !== 'PGRST202') throw new Error('Rotation RPC failed');
  const active = await service.from('api_keys').select(columns, { count: 'exact' }).eq('user_id', userId).eq('is_active', true).limit(101);
  if (active.error || !Array.isArray(active.data) || typeof active.count !== 'number' || active.count !== active.data.length || active.count > 100) throw new Error('Active keys unavailable');
  if (active.data.some(row => row.user_id !== userId)) throw new Error('Invalid key ownership');
  const fresh = { id: randomUUID(), user_id: userId, key: 'red_live_' + randomBytes(24).toString('hex'), is_active: true, created_at: new Date().toISOString() };
  const replacements = [...active.data.map(row => ({ ...row, is_active: false })), fresh];
  // One PostgREST bulk upsert = one database transaction. Never revoke and insert in separate requests.
  const result = await service.from('api_keys').upsert(replacements, { onConflict: 'id' }).select(columns);
  if (result.error || !Array.isArray(result.data)) throw new Error('Atomic key replacement failed');
  const key = result.data.find(row => row.id === fresh.id && row.user_id === userId && row.is_active === true);
  if (!key) throw new Error('New key unavailable');
  return key;
};

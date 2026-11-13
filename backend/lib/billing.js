const supabase = require('../config/supabase');
const { withOperations, removeImage } = require('./operations-store');
const catalog = {
  basic: { name: 'Basic', price: 25000, daily: 3000, days: 30 },
  vip: { name: 'VIP', price: 50000, daily: 15000, days: 30 },
  enterprise: { name: 'Enterprise', price: 150000, daily: 999999, days: 30 },
};
const audit = (state, actor, action, target) => {
  state.audit.push({
    id: require('node:crypto').randomUUID(),
    actor,
    action,
    target,
    at: new Date().toISOString(),
  });
  if (state.audit.length > 5000)
    state.audit.splice(0, state.audit.length - 5000);
};
async function ensureEntitlement(userId) {
  return withOperations(async (state, save) => {
    const grant = state.subscriptions[userId];
    if (!grant || Date.parse(grant.expiresAt) > Date.now()) return;
    const profile = await supabase
      .from('profiles')
      .select('plan,limit_daily,limit_remaining')
      .eq('id', userId)
      .maybeSingle();
    if (profile.error) throw new Error('Subscription unavailable');
    if (profile.data && profile.data.plan === grant.plan) {
      const used = Math.max(
        0,
        (profile.data.limit_daily || 0) - (profile.data.limit_remaining || 0),
      );
      const update = await supabase
        .from('profiles')
        .update({
          plan: 'free',
          limit_daily: 100,
          limit_remaining: Math.max(0, 100 - used),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .eq('plan', grant.plan);
      if (update.error) throw new Error('Subscription expiry update failed');
    }
    delete state.subscriptions[userId];
    await save();
  });
}
async function clearManagedPlan(userId) {
  return withOperations(async (state, save) => {
    delete state.subscriptions[userId];
    await save();
  });
}
async function queueUserCleanup(userId) {
  return withOperations(async (state, save) => {
    state.cleanupPending = [
      ...new Set([...(state.cleanupPending || []), userId]),
    ];
    await save();
  });
}
async function cleanupUser(userId) {
  return withOperations(async (state, save) => {
    const files = [];
    delete state.subscriptions[userId];
    state.cleanupPending = (state.cleanupPending || []).filter(
      (id) => id !== userId,
    );
    for (const order of state.orders.filter((row) => row.userId === userId)) {
      if (order.receipt) files.push(order.receipt);
      order.receipt = null;
      order.userId = null;
      order.email = '';
      order.customerDeleted = true;
      if (!['approved', 'rejected'].includes(order.status))
        order.status = 'cancelled';
    }
    await save();
    for (const file of files) await removeImage(file).catch(() => {});
  });
}
function startBillingReconciler() {
  const run = async () => {
    try {
      const ids = await withOperations((state) =>
        Object.keys(state.subscriptions),
      );
      for (const id of ids) await ensureEntitlement(id);
      const pending = await withOperations(
        (state) => state.cleanupPending || [],
      );
      for (const id of pending) {
        const profile = await supabase
          .from('profiles')
          .select('id')
          .eq('id', id)
          .maybeSingle();
        if (!profile.error && !profile.data) await cleanupUser(id);
      }
    } catch {
      console.error('[BILLING] Reconciliation unavailable');
    }
  };
  const timer = setInterval(run, 60000);
  timer.unref();
  void run();
}
module.exports = {
  catalog,
  audit,
  ensureEntitlement,
  clearManagedPlan,
  queueUserCleanup,
  cleanupUser,
  startBillingReconciler,
};

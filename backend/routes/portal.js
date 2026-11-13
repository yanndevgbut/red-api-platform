const express = require('express');
const { randomUUID } = require('node:crypto');
const supabase = require('../config/supabase');
const userSession = require('../middleware/user-session');
const {
  withOperations,
  saveImage,
  readImage,
  removeImage,
} = require('../lib/operations-store');
const { catalog, audit, ensureEntitlement } = require('../lib/billing');
const { getMaintenance } = require('../lib/maintenance-state');
const router = express.Router();
const uuid = (value) => /^[a-f0-9-]{36}$/i.test(value);
const problem = (status, message) =>
  Object.assign(new Error(message), { status, userMessage: message });
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    res
      .status(error.status || 503)
      .json({
        error:
          error.userMessage || 'Layanan belum tersedia. Silakan coba lagi.',
      });
  }
};
const confirmed = (req, action) => {
  if (req.get('x-confirm-action') !== action)
    throw problem(400, 'Konfirmasi tindakan diperlukan.');
};
const cleanOrder = (order, admin = false) => ({
  id: order.id,
  reference: order.reference,
  plan: order.plan,
  amount: order.amount,
  days: order.days,
  paymentNote: order.paymentNote,
  status: order.status,
  createdAt: order.createdAt,
  submittedAt: order.submittedAt,
  approvedAt: order.approvedAt,
  expiresAt: order.expiresAt,
  reviewerNote: order.reviewerNote,
  proofAvailable: !!order.receipt,
  ...(admin
    ? {
        userId: order.userId,
        email: order.email,
        customerDeleted: !!order.customerDeleted,
      }
    : {}),
});
async function available() {
  const state = await getMaintenance();
  if (state.active) throw problem(503, state.message);
}
function findOrder(state, req, admin = false) {
  if (!uuid(req.params.id)) throw problem(404, 'Pesanan tidak ditemukan.');
  const order = state.orders.find((row) => row.id === req.params.id);
  if (!order || (!admin && order.userId !== req.portalUser.id))
    throw problem(404, 'Pesanan tidak ditemukan.');
  return order;
}
async function sendImage(res, file) {
  const image = await readImage(file);
  res.set('Content-Type', image.type);
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(image.bytes);
}
const uploadWindows = new Map();
router.use((req, res, next) => {
  if (req.method === 'GET' && req.path === '/state') return next();
  return userSession(req, res, next);
});
router.use('/admin', (req, res, next) =>
  req.portalUser?.admin
    ? next()
    : res.status(403).json({ error: 'Administrator aktif diperlukan.' }),
);
router.use((req, res, next) => {
  const upload =
    req.method === 'POST' &&
    (req.path === '/admin/qris' ||
      /^\/orders\/[a-f0-9-]{36}\/proof$/i.test(req.path));
  if (upload) {
    const now = Date.now();
    for (const [id, value] of uploadWindows)
      if (value.until <= now) uploadWindows.delete(id);
    const window = uploadWindows.get(req.portalUser.id) || {
      count: 0,
      until: now + 60000,
    };
    window.count++;
    if (window.count > 12 || uploadWindows.size > 1000)
      return res
        .status(429)
        .json({ error: 'Terlalu banyak upload. Coba lagi sebentar.' });
    uploadWindows.set(req.portalUser.id, window);
  }
  return express.json({ limit: upload ? '4200kb' : '16kb' })(req, res, next);
});
router.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
router.get(
  '/state',
  wrap(async (_req, res) => {
    const maintenance = await getMaintenance();
    const data = await withOperations((state) => ({
      announcements: state.announcements
        .filter(
          (item) => !item.deletedAt && Date.parse(item.expiresAt) > Date.now(),
        )
        .map(({ id, title, message, expiresAt }) => ({
          id,
          title,
          message,
          expiresAt,
        })),
      qrisReady: !!state.qris?.file,
    }));
    res.json({
      ...data,
      maintenance,
      plans: catalog,
      serverTime: new Date().toISOString(),
    });
  }),
);
router.get(
  '/orders',
  wrap(async (req, res) => {
    await available();
    await ensureEntitlement(req.portalUser.id);
    res.json(
      await withOperations((state) => ({
        orders: state.orders
          .filter((row) => row.userId === req.portalUser.id)
          .slice(-100)
          .reverse()
          .map((row) => cleanOrder(row)),
        subscription: state.subscriptions[req.portalUser.id] || null,
      })),
    );
  }),
);
router.post(
  '/orders',
  wrap(async (req, res) => {
    await available();
    const { plan } = req.body || {};
    if (
      !Object.hasOwn(catalog, plan) ||
      Object.keys(req.body || {}).some((key) => key !== 'plan')
    )
      throw problem(400, 'Paket tidak valid.');
    const order = await withOperations(async (state, save) => {
      if (!state.qris?.file) throw problem(503, 'QRIS belum disiapkan admin.');
      await readImage(state.qris.file);
      const pending = state.orders.find(
        (row) =>
          row.userId === req.portalUser.id &&
          row.plan === plan &&
          ['awaiting_proof', 'submitted', 'approving'].includes(row.status),
      );
      if (pending) return pending;
      if (
        state.orders.filter(
          (row) =>
            row.userId === req.portalUser.id &&
            ['awaiting_proof', 'submitted', 'approving'].includes(row.status),
        ).length >= 3
      )
        throw problem(409, 'Selesaikan pesanan sebelumnya terlebih dahulu.');
      const id = randomUUID();
      const item = {
        id,
        reference: id.slice(0, 8).toUpperCase(),
        userId: req.portalUser.id,
        email: req.portalUser.email,
        plan,
        amount: catalog[plan].price,
        days: catalog[plan].days,
        status: 'awaiting_proof',
        createdAt: new Date().toISOString(),
        qrisFile: state.qris.file,
        paymentNote: state.qris.note || '',
      };
      state.orders.push(item);
      await save();
      return item;
    });
    res.status(201).json(cleanOrder(order));
  }),
);
router.get(
  '/orders/:id/qris',
  wrap(async (req, res) => {
    await available();
    const file = await withOperations(
      (state) => findOrder(state, req).qrisFile,
    );
    await sendImage(res, file);
  }),
);
router.post(
  '/orders/:id/proof',
  wrap(async (req, res) => {
    await available();
    const order = await withOperations(async (state, save) => {
      const item = findOrder(state, req);
      if (item.status !== 'awaiting_proof')
        throw problem(
          409,
          'Bukti pesanan ini sudah dikirim atau pesanan ditutup.',
        );
      let file;
      try {
        file = await saveImage(req.body?.image);
      } catch {
        throw problem(400, 'Gunakan gambar PNG/JPEG valid maksimal 3 MB.');
      }
      item.receipt = file;
      item.status = 'submitted';
      item.submittedAt = new Date().toISOString();
      try {
        await save();
      } catch (error) {
        await removeImage(file);
        throw error;
      }
      return item;
    });
    res.json(cleanOrder(order));
  }),
);
router.get(
  '/orders/:id/proof',
  wrap(async (req, res) => {
    const file = await withOperations(
      (state) => findOrder(state, req, req.portalUser.admin).receipt,
    );
    if (!file) throw problem(404, 'Bukti tidak tersedia.');
    await sendImage(res, file);
  }),
);
router.get(
  '/admin/announcements',
  wrap(async (_req, res) =>
    res.json(
      await withOperations((state) =>
        state.announcements.slice(-500).reverse(),
      ),
    ),
  ),
);
router.post(
  '/admin/announcements',
  wrap(async (req, res) => {
    const { title, message, expiresAt } = req.body || {};
    const expires = Date.parse(expiresAt);
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 120 ||
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 4000 ||
      !Number.isFinite(expires) ||
      expires <= Date.now() ||
      expires > Date.now() + 366 * 86400000
    )
      throw problem(
        400,
        'Isi judul, pesan, dan waktu kedaluwarsa yang valid (maksimal 1 tahun).',
      );
    const item = await withOperations(async (state, save) => {
      const row = {
        id: randomUUID(),
        title: title.trim(),
        message: message.trim(),
        expiresAt: new Date(expires).toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: req.apiUser.id,
      };
      state.announcements.push(row);
      audit(state, req.apiUser.id, 'announcement.create', row.id);
      await save();
      return row;
    });
    res.status(201).json(item);
  }),
);
router.delete(
  '/admin/announcements/:id',
  wrap(async (req, res) => {
    confirmed(req, 'delete-announcement');
    await withOperations(async (state, save) => {
      const item = state.announcements.find((row) => row.id === req.params.id);
      if (!item) throw problem(404, 'Pengumuman tidak ditemukan.');
      if (!item.deletedAt) {
        item.deletedAt = new Date().toISOString();
        audit(state, req.apiUser.id, 'announcement.delete', item.id);
        await save();
      }
    });
    res.json({ deleted: true });
  }),
);
router.get(
  '/admin/orders',
  wrap(async (_req, res) =>
    res.json(
      await withOperations((state) =>
        state.orders
          .slice(-500)
          .reverse()
          .map((row) => cleanOrder(row, true)),
      ),
    ),
  ),
);
router.get(
  '/admin/payment-settings',
  wrap(async (_req, res) =>
    res.json(
      await withOperations((state) => ({
        qrisReady: !!state.qris?.file,
        note: state.qris?.note || '',
        updatedAt: state.qris?.updatedAt,
        plans: catalog,
      })),
    ),
  ),
);
router.get(
  '/admin/qris',
  wrap(async (_req, res) => {
    const file = await withOperations((state) => state.qris?.file);
    if (!file) throw problem(404, 'QRIS belum tersedia.');
    await sendImage(res, file);
  }),
);
router.post(
  '/admin/qris',
  wrap(async (req, res) => {
    confirmed(req, 'replace-qris');
    if (
      req.body?.note != null &&
      (typeof req.body.note !== 'string' || req.body.note.length > 500)
    )
      throw problem(400, 'Catatan maksimal 500 karakter.');
    await withOperations(async (state, save) => {
      let file;
      try {
        file = await saveImage(req.body?.image);
      } catch {
        throw problem(400, 'Gunakan QRIS PNG/JPEG valid maksimal 3 MB.');
      }
      state.qris = {
        file,
        note: req.body.note || '',
        updatedAt: new Date().toISOString(),
      };
      audit(state, req.apiUser.id, 'qris.update', file);
      try {
        await save();
      } catch (error) {
        await removeImage(file);
        throw error;
      }
    });
    res.json({ saved: true });
  }),
);
router.post(
  '/admin/orders/:id/reject',
  wrap(async (req, res) => {
    confirmed(req, 'reject-payment');
    const note = req.body?.note;
    if (typeof note !== 'string' || !note.trim() || note.length > 500)
      throw problem(400, 'Isi alasan penolakan (maksimal 500 karakter).');
    const order = await withOperations(async (state, save) => {
      const item = findOrder(state, req, true);
      if (!['awaiting_proof', 'submitted', 'rejected'].includes(item.status))
        throw problem(409, 'Pesanan tidak dapat ditolak pada status ini.');
      item.status = 'rejected';
      item.reviewerNote = note.trim();
      item.reviewedAt = new Date().toISOString();
      audit(state, req.apiUser.id, 'payment.reject', item.id);
      await save();
      return item;
    });
    res.json(cleanOrder(order, true));
  }),
);
router.post(
  '/admin/orders/:id/approve',
  wrap(async (req, res) => {
    confirmed(req, 'approve-payment');
    const order = await withOperations(async (state, save) => {
      const item = findOrder(state, req, true);
      if (item.status === 'approved') return item;
      if (
        !['submitted', 'approving'].includes(item.status) ||
        !item.receipt ||
        !item.userId ||
        item.customerDeleted
      )
        throw problem(409, 'Pesanan belum memiliki bukti atau sudah ditutup.');
      const profile = await supabase
        .from('profiles')
        .select('id,banned,plan,limit_daily,limit_remaining')
        .eq('id', item.userId)
        .maybeSingle();
      if (profile.error) throw new Error('Profile unavailable');
      if (!profile.data || profile.data.banned !== false)
        throw problem(409, 'Akun pelanggan tidak aktif.');
      if (item.status !== 'approving') {
        const now = Date.now();
        const old = state.subscriptions[item.userId];
        const base =
          old?.plan === item.plan
            ? Math.max(now, Date.parse(old.expiresAt))
            : now;
        const used = Math.max(
          0,
          (profile.data.limit_daily || 0) - (profile.data.limit_remaining || 0),
        );
        item.intent = {
          previousPlan: profile.data.plan,
          expiresAt: new Date(base + item.days * 86400000).toISOString(),
          approvedAt: new Date(now).toISOString(),
          remaining: Math.max(0, catalog[item.plan].daily - used),
        };
        item.status = 'approving';
        await save();
      }
      const intent = item.intent;
      const changes = {
        plan: item.plan,
        limit_daily: catalog[item.plan].daily,
        updated_at: new Date().toISOString(),
      };
      if (intent.previousPlan !== item.plan)
        changes.limit_remaining = intent.remaining;
      if (profile.data.plan === intent.previousPlan) {
        const update = await supabase
          .from('profiles')
          .update(changes)
          .eq('id', item.userId)
          .eq('plan', intent.previousPlan)
          .select('id');
        if (update.error) throw new Error('Plan update failed');
        if (!update.data?.length && intent.previousPlan !== item.plan)
          throw problem(
            409,
            'Paket berubah selama persetujuan. Periksa kembali akun pelanggan.',
          );
      } else if (profile.data.plan !== item.plan)
        throw problem(409, 'Paket pelanggan berubah. Periksa kembali pesanan.');
      item.status = 'approved';
      item.approvedAt = intent.approvedAt;
      item.expiresAt = intent.expiresAt;
      item.reviewedBy = req.apiUser.id;
      state.subscriptions[item.userId] = {
        plan: item.plan,
        expiresAt: item.expiresAt,
        orderId: item.id,
      };
      audit(state, req.apiUser.id, 'payment.approve', item.id);
      await save();
      return item;
    });
    res.json(cleanOrder(order, true));
  }),
);
module.exports = router;

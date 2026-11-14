const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('../backend/node_modules/express');
const ids = {
  admin: randomUUID(),
  member: randomUUID(),
  other: randomUUID(),
  banned: randomUUID(),
};
const profiles = Object.fromEntries(
  Object.entries(ids).map(([token, id]) => [
    id,
    {
      id,
      email: token + '@example.com',
      role: token === 'admin' ? 'admin' : 'user',
      banned: token === 'banned',
      plan: 'free',
      limit_daily: 100,
      limit_remaining: 80,
    },
  ]),
);
let updates = 0,
  failUpdate = false,
  failSettings = false,
  failDeletion = false;
let raceUpgrade = false;
const deleted = [];
const settings = {
  maintenance_mode: false,
  maintenance_message: 'Maintenance',
};
const client = require.resolve('../backend/config/supabase');
require.cache[client] = {
  id: client,
  filename: client,
  loaded: true,
  exports: {
    auth: {
      getUser: async (token) => ({
        data: {
          user: ids[token]
            ? { id: ids[token], email: token + '@example.com' }
            : null,
        },
      }),
      admin: {
        deleteUser: async (id) => {
          if (failDeletion) return { error: {} };
          deleted.push(id);
          delete profiles[id];
          return {};
        },
      },
    },
    from(table) {
      return {
        filters: {},
        select() {
          return this;
        },
        eq(k, v) {
          this.filters[k] = v;
          return this;
        },
        update(body) {
          this.body = body;
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        async single() {
          return failSettings
            ? { error: {} }
            : {
                data: Object.assign(settings, this.body || {}),
              };
        },
        async maybeSingle() {
          return { data: profiles[this.filters.id] || null };
        },
        then(resolve) {
          if (failUpdate) return resolve({ error: { code: 'FAIL' } });
          const p = profiles[this.filters.id];
          if (this.body && p && raceUpgrade) {
            Object.assign(p, {
              plan: 'enterprise',
              limit_daily: 999999,
              limit_remaining: 777777,
            });
            raceUpgrade = false;
          }
          if (
            this.body &&
            p &&
            (!this.filters.plan || p.plan === this.filters.plan)
          ) {
            Object.assign(p, this.body);
            updates++;
            resolve({ data: [{ id: p.id }] });
          } else resolve({ data: [] });
        },
      };
    },
  },
};
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPV8AAAAASUVORK5CYII=';
test('announcements, private receipts, manual approvals, expiry, delete users and maintenance controls', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'red-portal-'));
  process.env.OPERATIONS_FILE = path.join(dir, 'operations.json');
  const store = require('../backend/lib/operations-store');
  const billing = require('../backend/lib/billing');
  const maintenance = require('../backend/lib/maintenance-state');
  const app = express();
  app.use('/api/portal', require('../backend/routes/portal'));
  app.use(express.json());
  app.use('/api/admin', require('../backend/routes/admin'));
  app.use(require('../backend/middleware/maintenance'));
  app.get('/business', (_q, r) => r.json({ ok: true }));
  app.use((err, _q, r, _n) =>
    r.status(err.status || 500).json({ error: 'Bad body' }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = async (token, p, method = 'GET', body, action, target) =>
    fetch(base + p, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(action ? { 'X-Confirm-Action': action } : {}),
        ...(target ? { 'X-Confirm-Target': target } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.throws(() => store.imageData('data:image/svg+xml;base64,PHN2Zz4='));
    assert.throws(() =>
      store.imageData(
        'data:image/png;base64,' +
          Buffer.from('notanimage'.repeat(4)).toString('base64'),
      ),
    );
    assert.equal(store.imageData(png).ext, 'png');
    await assert.rejects(() => store.readImage('../.env'));
    assert.equal((await req(null, '/api/portal/admin/orders')).status, 401);
    assert.equal((await req('member', '/api/portal/admin/orders')).status, 403);
    assert.equal((await req('banned', '/api/portal/orders')).status, 403);
    assert.equal(
      (await req('member', '/api/portal/orders', 'POST', { plan: 'basic' }))
        .status,
      503,
    );
    assert.equal(
      (await req('admin', '/api/portal/admin/qris', 'POST', { image: png }))
        .status,
      400,
    );
    assert.equal(
      (
        await req(
          'admin',
          '/api/portal/admin/qris',
          'POST',
          { image: png, note: 'Pay carefully' },
          'replace-qris',
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await req('member', '/api/portal/orders', 'POST', {
          plan: 'basic',
          amount: 1,
        })
      ).status,
      400,
    );
    const order = await (
      await req('member', '/api/portal/orders', 'POST', { plan: 'basic' })
    ).json();
    assert.equal(order.amount, 25000);
    assert.equal(order.qrisFile, undefined);
    assert.equal(order.userId, undefined);
    const again = await (
      await req('member', '/api/portal/orders', 'POST', { plan: 'basic' })
    ).json();
    assert.equal(again.id, order.id);
    assert.equal(
      (await req('other', `/api/portal/orders/${order.id}/qris`)).status,
      404,
    );
    const qr = await req('member', `/api/portal/orders/${order.id}/qris`);
    assert.equal(qr.status, 200);
    assert.match(qr.headers.get('cache-control'), /private/);
    const approve = `/api/portal/admin/orders/${order.id}/approve`;
    assert.equal(
      (await req('admin', approve, 'POST', {}, 'approve-payment')).status,
      409,
    );
    assert.equal(
      (
        await req('other', `/api/portal/orders/${order.id}/proof`, 'POST', {
          image: png,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await req('member', `/api/portal/orders/${order.id}/proof`, 'POST', {
          image: png,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req('member', `/api/portal/orders/${order.id}/proof`, 'POST', {
          image: png,
        })
      ).status,
      409,
    );
    assert.equal(
      (await req('other', `/api/portal/orders/${order.id}/proof`)).status,
      404,
    );
    assert.equal(
      (await req('admin', `/api/portal/orders/${order.id}/proof`)).status,
      200,
    );
    assert.equal(
      (await req('member', approve, 'POST', {}, 'approve-payment')).status,
      403,
    );
    assert.equal((await req('admin', approve, 'POST', {})).status, 400);
    failUpdate = true;
    assert.equal(
      (await req('admin', approve, 'POST', {}, 'approve-payment')).status,
      503,
    );
    failUpdate = false;
    const approved = await (
      await req('admin', approve, 'POST', {}, 'approve-payment')
    ).json();
    assert.equal(approved.status, 'approved');
    assert.equal(profiles[ids.member].plan, 'basic');
    assert.equal(profiles[ids.member].limit_remaining, 2980);
    const expiry = approved.expiresAt;
    const twice = await (
      await req('admin', approve, 'POST', {}, 'approve-payment')
    ).json();
    assert.equal(twice.expiresAt, expiry);
    assert.equal(updates, 1);
    // A persistence failure after the database grant must be retryable without extending twice.
    const renewal = await (
      await req('member', '/api/portal/orders', 'POST', { plan: 'basic' })
    ).json();
    await req('member', `/api/portal/orders/${renewal.id}/proof`, 'POST', {
      image: png,
    });
    const renewalPath = `/api/portal/admin/orders/${renewal.id}/approve`;
    const originalRename = fs.rename;
    let failSave = true;
    fs.rename = async (...args) => {
      if (failSave && updates === 2) {
        failSave = false;
        throw new Error('Simulated disk failure after DB commit');
      }
      return originalRename(...args);
    };
    try {
      assert.equal(
        (await req('admin', renewalPath, 'POST', {}, 'approve-payment')).status,
        503,
      );
    } finally {
      fs.rename = originalRename;
    }
    const retry = await (
      await req('admin', renewalPath, 'POST', {}, 'approve-payment')
    ).json();
    assert.equal(retry.status, 'approved');
    assert.equal(
      Date.parse(retry.expiresAt) - Date.parse(expiry),
      30 * 86400000,
    );
    assert.equal(profiles[ids.member].limit_remaining, 2980);
    const before = updates;
    const duplicates = await Promise.all(
      [1, 2, 3].map(() =>
        req('admin', renewalPath, 'POST', {}, 'approve-payment'),
      ),
    );
    assert.ok(duplicates.every((r) => r.status === 200));
    assert.equal(updates, before);

    await store.withOperations(async (s, save) => {
      s.subscriptions[ids.member].expiresAt = new Date(
        Date.now() - 1000,
      ).toISOString();
      await save();
    });
    await billing.ensureEntitlement(ids.member);
    assert.equal(profiles[ids.member].plan, 'free');
    assert.equal(profiles[ids.member].limit_remaining, 80);
    // Lower tiers are rejected at checkout and for orders created before an upgrade.
    const legacy = await (
      await req('other', '/api/portal/orders', 'POST', { plan: 'basic' })
    ).json();
    await req('other', `/api/portal/orders/${legacy.id}/proof`, 'POST', {
      image: png,
    });
    Object.assign(profiles[ids.other], {
      plan: 'vip',
      limit_daily: 15000,
      limit_remaining: 12000,
    });
    const vipGrant = {
      plan: 'vip',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      orderId: 'existing-vip',
    };
    await store.withOperations(async (state, save) => {
      state.subscriptions[ids.other] = vipGrant;
      await save();
    });
    assert.equal(
      (await req('other', '/api/portal/orders', 'POST', { plan: 'basic' }))
        .status,
      409,
    );
    assert.equal(
      (await req('other', `/api/portal/orders/${legacy.id}/qris`)).status,
      409,
    );
    assert.equal(
      (
        await req('other', `/api/portal/orders/${legacy.id}/proof`, 'POST', {
          image: png,
        })
      ).status,
      409,
    );
    const legacyApproval = `/api/portal/admin/orders/${legacy.id}/approve`;
    assert.equal(
      (await req('admin', legacyApproval, 'POST', {}, 'approve-payment'))
        .status,
      409,
    );
    await store.withOperations(async (state, save) => {
      state.orders.find((o) => o.id === legacy.id).status = 'approving';
      await save();
    });
    assert.equal(
      (await req('admin', legacyApproval, 'POST', {}, 'approve-payment'))
        .status,
      409,
      'recovery of an in-progress old approval cannot downgrade',
    );
    assert.equal(profiles[ids.other].plan, 'vip');
    assert.equal(profiles[ids.other].limit_remaining, 12000);
    assert.deepEqual(
      await store.withOperations((state) => state.subscriptions[ids.other]),
      vipGrant,
    );
    assert.equal(
      (
        await req(
          'admin',
          `/api/portal/admin/orders/${legacy.id}/reject`,
          'POST',
          {
            note: 'Paket pelanggan sudah lebih tinggi. Tindak lanjuti pembayaran.',
          },
          'reject-payment',
        )
      ).status,
      200,
    );
    assert.equal(
      (await req('other', '/api/portal/orders', 'POST', { plan: 'vip' }))
        .status,
      201,
      'same-tier renewal remains available',
    );
    assert.equal(
      (await req('other', '/api/portal/orders', 'POST', { plan: 'enterprise' }))
        .status,
      201,
      'upgrades remain available',
    );
    profiles[ids.other].plan = 'enterprise';
    for (const plan of ['basic', 'vip'])
      assert.equal(
        (await req('other', '/api/portal/orders', 'POST', { plan })).status,
        409,
      );
    assert.equal(
      (await req('other', '/api/portal/orders', 'POST', { plan: 'enterprise' }))
        .status,
      201,
    );
    assert.equal(
      (await (await req('other', '/api/portal/orders')).json()).currentPlan,
      'enterprise',
    );
    for (const plan of [['basic'], { plan: 'basic' }])
      assert.equal(
        (await req('other', '/api/portal/orders', 'POST', { plan })).status,
        400,
      );
    profiles[ids.other].plan = 'unknown';
    assert.equal(
      (await req('other', '/api/portal/orders', 'POST', { plan: 'basic' }))
        .status,
      503,
    );
    profiles[ids.other].plan = 'vip';
    await store.withOperations(async (state, save) => {
      state.subscriptions[ids.other] = {
        ...vipGrant,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      await save();
    });
    assert.equal(
      (await req('other', '/api/portal/orders', 'POST', { plan: 'basic' }))
        .status,
      201,
      'expired higher-tier subscriptions can buy a lower tier after reverting to Free',
    );
    assert.equal(profiles[ids.other].plan, 'free');

    const vipPending = await store.withOperations((state) =>
      state.orders.find(
        (order) =>
          order.userId === ids.other &&
          order.plan === 'vip' &&
          order.status === 'awaiting_proof',
      ),
    );
    assert.equal(
      (
        await req(
          'other',
          `/api/portal/orders/${vipPending.id}/proof`,
          'POST',
          { image: png },
        )
      ).status,
      200,
    );
    raceUpgrade = true;
    assert.equal(
      (
        await req(
          'admin',
          `/api/portal/admin/orders/${vipPending.id}/approve`,
          'POST',
          {},
          'approve-payment',
        )
      ).status,
      409,
      'a concurrent upgrade must prevent the stale approval write',
    );
    assert.equal(profiles[ids.other].plan, 'enterprise');
    assert.equal(profiles[ids.other].limit_remaining, 777777);
    assert.equal(
      await store.withOperations((state) => state.subscriptions[ids.other]),
      undefined,
    );

    // Saving a message never toggles maintenance, and toggling preserves the saved text.
    const maintenancePath = '/api/admin/maintenance';
    assert.equal(
      (
        await req(
          'member',
          maintenancePath,
          'POST',
          { message: 'forged' },
          'maintenance',
        )
      ).status,
      403,
    );
    for (const message of ['', ' '.repeat(2), 'x'.repeat(501), 123])
      assert.equal(
        (
          await req(
            'admin',
            maintenancePath,
            'POST',
            { message },
            'maintenance',
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await req('admin', maintenancePath, 'POST', {
          message: 'missing confirmation',
        })
      ).status,
      400,
    );
    const custom = '<b>Jadwal perawatan</b>\nSilakan kembali nanti.';
    let saved = await (
      await req(
        'admin',
        maintenancePath,
        'POST',
        { message: custom },
        'maintenance',
      )
    ).json();
    assert.equal(saved.maintenance_mode, false);
    assert.equal(saved.maintenance_message, custom);
    saved = await (
      await req(
        'admin',
        maintenancePath,
        'POST',
        { active: true },
        'maintenance',
      )
    ).json();
    assert.equal(saved.maintenance_message, custom);
    assert.equal((await req(null, '/business')).status, 503);
    saved = await (
      await req(
        'admin',
        maintenancePath,
        'POST',
        { message: 'Pesan baru' },
        'maintenance',
      )
    ).json();
    assert.equal(saved.maintenance_mode, true);
    assert.equal(
      (await (await req(null, '/api/portal/state')).json()).maintenance.message,
      'Pesan baru',
    );
    saved = await (
      await req(
        'admin',
        maintenancePath,
        'POST',
        { active: false },
        'maintenance',
      )
    ).json();
    assert.equal(saved.maintenance_message, 'Pesan baru');
    const create = await req(
      'admin',
      '/api/portal/admin/announcements',
      'POST',
      {
        title: '<img src=x onerror=alert(1)>',
        message: 'plain text',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    );
    assert.equal(create.status, 201);
    const notice = await create.json();
    let state = await (await req(null, '/api/portal/state')).json();
    assert.equal(state.announcements.length, 1);
    assert.equal(state.announcements[0].createdBy, undefined);
    assert.equal(
      (
        await req(
          'admin',
          `/api/portal/admin/announcements/${notice.id}`,
          'DELETE',
          null,
          'delete-announcement',
        )
      ).status,
      200,
    );
    state = await (await req(null, '/api/portal/state')).json();
    assert.equal(state.announcements.length, 0);
    assert.equal(
      (await (await req('admin', '/api/portal/admin/announcements')).json())
        .length,
      1,
    );
    await store.withOperations(async (s, save) => {
      s.announcements.push({
        id: randomUUID(),
        title: 'expired',
        message: 'hidden',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      await save();
    });
    state = await (await req(null, '/api/portal/state')).json();
    assert.equal(state.announcements.length, 0);
    assert.equal(
      (
        await req(
          'member',
          `/api/admin/users/${ids.other}`,
          'DELETE',
          null,
          'delete-user',
          'other@example.com',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          'admin',
          `/api/admin/users/${ids.admin}`,
          'DELETE',
          null,
          'delete-user',
          'admin@example.com',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          'admin',
          `/api/admin/users/${ids.member}`,
          'DELETE',
          null,
          'delete-user',
          'wrong@example.com',
        )
      ).status,
      400,
    );
    failDeletion = true;
    assert.equal(
      (
        await req(
          'admin',
          `/api/admin/users/${ids.member}`,
          'DELETE',
          null,
          'delete-user',
          'member@example.com',
        )
      ).status,
      503,
    );
    assert.equal(
      (await store.withOperations((s) => s.orders[0])).userId,
      ids.member,
    );
    failDeletion = false;
    assert.equal(
      (
        await req(
          'admin',
          `/api/admin/users/${ids.member}`,
          'DELETE',
          null,
          'delete-user',
          'member@example.com',
        )
      ).status,
      200,
    );
    assert.deepEqual(deleted, [ids.member]);
    const clean = await store.withOperations((s) => s.orders[0]);
    assert.equal(clean.userId, null);
    assert.equal(clean.receipt, null);
    maintenance.setMaintenance({
      maintenance_mode: true,
      maintenance_message: 'Scheduled',
    });
    assert.equal((await req(null, '/business')).status, 503);
    assert.equal(
      (await req('other', '/api/portal/orders', 'POST', { plan: 'basic' }))
        .status,
      503,
    );
    assert.equal((await req('admin', '/api/portal/admin/orders')).status, 200);
    maintenance.setMaintenance({ maintenance_mode: false });
    assert.equal((await req(null, '/business')).status, 200);
    // Failed status lookup must not allow business requests after cached status expires.
    failSettings = true;
    const originalNow = Date.now;
    Date.now = () => originalNow() + 6000;
    try {
      assert.equal((await req(null, '/business')).status, 503);
    } finally {
      Date.now = originalNow;
      failSettings = false;
    }
    await fs.writeFile(process.env.OPERATIONS_FILE, 'invalid json');
    assert.equal((await req(null, '/api/portal/state')).status, 503);
  } finally {
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});

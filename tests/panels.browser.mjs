import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';

// Local fixture provider is used by both browser and server-side session verification.
// Build with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and sb_publishable_test.
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const ids = { 'test-token': '10000000-0000-0000-0000-000000000001', 'member-token': '10000000-0000-0000-0000-000000000002' };
let adminBanned = false;
let profileDelay = 0;
const profile = token => ({ id: ids[token], username: token === 'test-token' ? 'test_admin' : '<img src=x onerror="window.__xss=1">', email: 'qa@example.com', role: token === 'test-token' ? 'admin' : 'user', plan: 'free', limit_daily: 100, limit_remaining: 100, banned: token === 'test-token' && adminBanned, created_at: new Date().toISOString() });
const provider = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  res.setHeader('Content-Type', 'application/json');
  const token = req.headers.authorization?.replace(/^Bearer /i, '');
  if (req.url.startsWith('/auth/v1/user')) {
    if (!ids[token]) { res.writeHead(401); res.end(JSON.stringify({ msg: 'Invalid JWT' })); return; }
    res.end(JSON.stringify({ id: ids[token], aud: 'authenticated', email: 'qa@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })); return;
  }
  if (req.url.startsWith('/rest/v1/profiles')) {
    if (profileDelay) await new Promise(resolve => setTimeout(resolve, profileDelay));
    res.end(JSON.stringify(ids[token] ? profile(token) : null)); return;
  }
  if (req.url.startsWith('/rest/v1/system_settings')) { res.end(JSON.stringify({ maintenance_mode: false })); return; }
  res.end('[]');
});
await new Promise(resolve => provider.listen(54321, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
async function newPage(token, width = 360) {
  const page = await browser.newPage({ viewport: { width, height: 850 } });
  if (token) await page.addInitScript(({ token, id }) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id, aud: 'authenticated', email: 'qa@example.com', app_metadata: {}, user_metadata: { role: 'admin' }, created_at: new Date().toISOString() } })), { token, id: ids[token] });
  await page.route('**/api/telemetry', route => route.fulfill({ status: 503, json: { status: false } }));
  return page;
}
try {
  const anonymous = await newPage();
  for (const path of ['/admin', '/admin/users', '/admin/not-a-page']) {
    await anonymous.goto(base + path); await anonymous.waitForURL(base + '/');
    await anonymous.getByText('FAST, RELIABLE', { exact: false }).waitFor();
  }
  await anonymous.getByRole('button', { name: 'Buka menu navigasi' }).click();
  assert.equal(await anonymous.getByRole('button', { name: '05. MASTER ADMIN CONSOLE' }).count(), 0);
  console.log('PASS anonymous admin URLs redirect to landing and admin navigation is absent');
  await anonymous.close();

  const member = await newPage('member-token', 1280);
  profileDelay = 700;
  await member.goto(base + '/?tab=admin');
  await member.getByText('Memuat data akun...', { exact: true }).waitFor();
  assert.equal(await member.getByRole('button', { name: 'MASUK GOOGLE', exact: true }).count(), 0);
  await member.waitForURL(base + '/'); profileDelay = 0;
  await member.getByRole('button', { name: 'Logout', exact: true }).waitFor();
  assert.equal(await member.getByRole('button', { name: 'ADMIN PANEL', exact: true }).count(), 0);
  await member.getByRole('button', { name: 'Buka menu navigasi' }).click();
  assert.equal(await member.getByRole('button', { name: '05. MASTER ADMIN CONSOLE' }).count(), 0);
  assert.equal(await member.evaluate(() => window.__xss), undefined);
  assert.equal(await member.locator('img[src="x"]').count(), 0);
  await member.context().addCookies([{ name: 'red_admin_session', value: 'member-token', domain: '127.0.0.1', path: '/admin' }]);
  await member.goto(base + '/admin/users'); await member.waitForURL(base + '/');
  const deniedCookie = await member.request.post(base + '/api/admin/session', { headers: { Authorization: 'Bearer member-token' } });
  assert.equal(deniedCookie.status(), 403);
  const idor = await member.request.get(base + '/api/user?userId=' + ids['test-token'], { headers: { Authorization: 'Bearer member-token' } });
  assert.equal(idor.status(), 403);
  assert.equal((await member.request.get(base + '/api/admin/users')).status(), 401);
  console.log('PASS member/forged admin cookie redirects, delayed auth has no login flash, IDOR denied and username XSS escaped');
  await member.close();

  const admin = await newPage('test-token', 1280);
  let categories = [];
  await admin.route('**/api/categories', route => {
    if (route.request().method() === 'POST') categories.push(route.request().postDataJSON().name);
    return route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, json: { categories } });
  });
  await admin.route('**/api/admin/endpoints', route => route.fulfill({ json: [] }));
  await admin.route('**/api/admin/users', route => route.fulfill({ json: [profile('test-token')] }));
  await admin.route('**/api/admin/logs', route => route.fulfill({ json: [] }));
  await admin.route('**/api/admin/system', route => route.fulfill({ json: { maintenance_mode: false } }));
  await admin.goto(base + '/');
  await admin.getByRole('button', { name: 'ADMIN PANEL', exact: true }).waitFor();
  await admin.getByRole('button', { name: 'ADMIN PANEL', exact: true }).click();
  await admin.waitForURL('**/admin/endpoints');
  await admin.getByRole('heading', { name: 'Endpoint Registry', exact: true }).waitFor();
  const cookie = (await admin.context().cookies()).find(cookie => cookie.name === 'red_admin_session');
  assert.ok(cookie?.httpOnly); assert.equal(cookie.path, '/admin'); assert.equal(cookie.sameSite, 'Strict'); assert.ok(cookie.secure);
  for (const [id, title] of [['new-endpoint', 'Tambah Endpoint'], ['categories', 'Kategori'], ['users', 'Manajemen Pengguna'], ['logs', 'Log Akses'], ['settings', 'Pengaturan Sistem'], ['endpoints', 'Endpoint Registry']]) {
    await admin.getByRole('button', { name: 'Buka menu admin' }).click();
    const menu = admin.getByRole('dialog', { name: 'MENU ADMIN' });
    await menu.getByRole('link', { name: new RegExp(title) }).click();
    await admin.waitForURL('**/admin/' + id);
    await admin.getByRole('heading', { name: title, exact: true }).waitFor();
    for (const width of [320, 360, 768]) { await admin.setViewportSize({ width, height: 850 }); assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
    if (id === 'categories') {
      await admin.getByLabel('Nama kategori', { exact: true }).fill('Utilities');
      await admin.getByRole('button', { name: 'Tambah kategori', exact: true }).click();
      await admin.getByText('Kategori berhasil ditambahkan.', { exact: true }).waitFor();
    }
  }
  await admin.getByRole('button', { name: 'Buka menu admin' }).click();
  await admin.keyboard.press('Escape'); await admin.getByRole('dialog', { name: 'MENU ADMIN' }).waitFor({ state: 'hidden' });
  await admin.reload(); await admin.getByRole('heading', { name: 'Endpoint Registry', exact: true }).waitFor();
  const document = await admin.request.get(base + '/'); const html = await document.text();
  const csp = document.headers()['content-security-policy']; assert.ok(csp.includes("object-src 'none'"));
  const nonce = csp.match(/'nonce-([^']+)'/)[1]; assert.ok(html.includes('nonce="' + nonce + '"'));
  await admin.evaluate(() => { const script = document.createElement('script'); script.textContent = 'window.__inlineExecuted=true'; document.body.append(script); });
  assert.equal(await admin.evaluate(() => window.__inlineExecuted), undefined, 'CSP blocks untrusted inline JavaScript');
  adminBanned = true;
  await admin.goto(base + '/admin/users'); await admin.waitForURL(base + '/'); adminBanned = false;
  console.log('PASS admin-only cookie/navigation, separate pages, categories, mobile layout, Escape, CSP nonce and fresh ban enforcement');
  await admin.close();
  assert.equal((await fetch(base + '/api/user')).status, 401);
} finally { await browser.close(); await new Promise(resolve => provider.close(resolve)); }

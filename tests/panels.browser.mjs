import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run against a local server built with NEXT_PUBLIC_SUPABASE_URL=https://test-project.supabase.co
// and NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test. All provider data is mocked.
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const profile = { id: '10000000-0000-0000-0000-000000000001', username: 'test_admin', email: 'test@example.com', role: 'admin', plan: 'free', limit_daily: 100, limit_remaining: 100, banned: false };
const stats = { status: true, data: { node: 'TEST-NODE', platform: 'linux', node_version: 'v22', cpu: { usage_percent: 12, cores: 2, model: 'Test CPU' }, memory: { used_gb: '0.10', total_gb: '1.00', usage_percent: 10 }, uptime: { raw_seconds: 60, formatted: '0d 0h 1m' }, timestamp: new Date().toISOString() } };
async function pageFor(width = 360) {
  const page = await browser.newPage({ viewport: { width, height: 850 } });
  await page.route('https://test-project.supabase.co/**', route => route.fulfill({ status: 200, json: [] }));
  return page;
}
try {
  const page = await pageFor();
  let fail = true;
  await page.route('**/api/telemetry', route => route.fulfill({ status: fail ? 503 : 200, json: fail ? { status: false } : stats }));
  await page.goto(baseURL);
  await page.getByText('Tidak tersedia', { exact: true }).first().waitFor();
  assert.equal(await page.getByText('Loading...', { exact: true }).count(), 0);
  fail = false;
  await page.getByRole('button', { name: 'Coba lagi / Refresh' }).click();
  await page.getByText('TEST-NODE', { exact: true }).waitFor();
  await page.waitForTimeout(50);
  fail = true;
  await page.getByRole('button', { name: 'Coba lagi / Refresh' }).click();
  await page.getByText(/data mungkin kedaluwarsa/).waitFor();
  assert.equal(await page.getByText('TEST-NODE', { exact: true }).count(), 1);
  for (const width of [320, 360, 768]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `overflow at ${width}px`);
  }
  console.log('PASS telemetry error, recovery, stale data and responsive layout');
  await page.close();

  const stalled = await pageFor();
  await stalled.route('**/api/telemetry', async route => { await new Promise(resolve => setTimeout(resolve, 9000)); await route.abort().catch(() => {}); });
  await stalled.goto(baseURL);
  await stalled.getByText('Tidak tersedia', { exact: true }).first().waitFor({ timeout: 12000 });
  console.log('PASS stalled telemetry exits loading');
  await stalled.close();

  const admin = await pageFor();
  await admin.addInitScript(({ profile }) => {
    localStorage.setItem('sb-test-project-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: profile.id, email: profile.email, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() } }));
  }, { profile });
  await admin.route('**/api/user', route => route.fulfill({ json: { profile, apiKey: null } }));
  let deny = true;
  await admin.route('https://test-project.supabase.co/rest/v1/**', route => {
    if (deny) return route.fulfill({ status: 500, json: { code: '42P17', message: 'policy recursion' } });
    const url = route.request().url();
    const data = url.includes('/system_settings') ? { maintenance_mode: false } : url.includes('/profiles') ? [profile] : [];
    return route.fulfill({ json: data });
  });
  await admin.goto(baseURL + '/?tab=admin');
  await admin.getByText('Data tidak dapat diperbarui.', { exact: false }).waitFor();
  deny = false;
  await admin.getByRole('button', { name: 'Coba lagi / Refresh' }).click();
  await admin.getByText('Data panel tersinkronisasi.', { exact: false }).waitFor();
  console.log('PASS admin provider error and retry');
  await admin.waitForURL('**/admin/endpoints');
  assert.equal(await admin.locator('form').count(), 0, 'registry page excludes endpoint creation');
  assert.equal(await admin.getByText('MAINTENANCE MODE', { exact: true }).count(), 0);
  const menu = () => admin.getByRole('dialog', { name: 'MENU ADMIN' });
  await admin.getByRole('button', { name: 'Buka menu admin' }).click();
  await menu().waitFor();
  await admin.keyboard.press('Escape');
  await menu().waitFor({ state: 'hidden' });
  assert.equal(await admin.getByRole('button', { name: 'Buka menu admin' }).evaluate(el => el === document.activeElement), true, 'focus returns to menu trigger');
  const sections = [
    ['new-endpoint', 'Tambah Endpoint'], ['users', 'Manajemen Pengguna'],
    ['logs', 'Log Akses'], ['settings', 'Pengaturan Sistem'], ['endpoints', 'Endpoint Registry'],
  ];
  for (const [id, title] of sections) {
    await admin.getByRole('button', { name: 'Buka menu admin' }).click();
    await menu().getByRole('link', { name: new RegExp(title) }).click();
    await admin.waitForURL(`**/admin/${id}`);
    await admin.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(await admin.getByRole('dialog').count(), 0, 'menu closes after navigation');
    for (const width of [320, 360, 768]) {
      await admin.setViewportSize({ width, height: 850 });
      assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `admin ${id} overflow at ${width}px`);
    }
    if (id === 'new-endpoint') assert.equal(await admin.locator('form').count(), 1);
    if (id !== 'settings') assert.equal(await admin.getByText('MAINTENANCE MODE', { exact: true }).count(), 0);
  }
  await admin.goBack();
  await admin.waitForURL('**/admin/settings');
  await admin.getByRole('heading', { name: 'Pengaturan Sistem', exact: true }).waitFor();
  await admin.reload();
  await admin.getByRole('heading', { name: 'Pengaturan Sistem', exact: true }).waitFor();
  await admin.route('**/api/endpoints', route => route.fulfill({ json: [] }));
  await admin.goto(baseURL + '/?tab=docs');
  const categories = admin.getByRole('group', { name: 'Kategori endpoint' });
  await categories.waitFor();
  await admin.setViewportSize({ width: 320, height: 850 });
  assert.equal(await categories.evaluate(el => el.scrollWidth > el.clientWidth), true, 'categories scroll horizontally');
  const rows = await categories.getByRole('button').evaluateAll(buttons => buttons.map(button => Math.round(button.getBoundingClientRect().top)));
  assert.equal(new Set(rows).size, 1, 'category buttons stay on one row');
  const whatsapp = categories.getByRole('button', { name: 'WHATSAPP', exact: true });
  await whatsapp.focus();
  await admin.keyboard.press('Enter');
  assert.equal(await whatsapp.getAttribute('aria-pressed'), 'true');
  assert.equal(await categories.evaluate(el => el.scrollLeft > 0), true);
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal((await admin.title()).includes('RED API'), true);
  assert.equal((await admin.locator('body').innerText()).includes('RED/API'), false);
  console.log('PASS admin pages, slide menu, Escape, focus, history, reload, category scrolling and RED API branding');
  await admin.close();
  const locked = await pageFor();
  await locked.goto(baseURL + '/admin/users');
  await locked.getByText('ADMIN CONSOLE TERKUNCI', { exact: true }).waitFor();
  assert.equal(await locked.getByRole('button', { name: 'Buka menu admin' }).count(), 0);
  console.log('PASS direct admin URL remains locked without a session');
  await locked.close();

  const callback = await pageFor();
  await callback.goto(baseURL + '/auth/callback');
  await callback.getByText(/Sesi login belum diterima/).waitFor({ timeout: 18000 });
  console.log('PASS OAuth callback without session exits loading');
  await callback.close();
  const response = await fetch(baseURL + '/api/user?userId=' + profile.id);
  assert.equal(response.status, 401);
  console.log('PASS account route rejects unauthenticated reads');
} finally {
  await browser.close();
}

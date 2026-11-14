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
  await page.route('**/api/portal/state', route => route.fulfill({json:{maintenance:{active:false,message:''},announcements:[],qrisReady:false,serverTime:new Date().toISOString()}}));
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
  let displayedKey = { id: 'test-key-old', user_id: ids['member-token'], key: 'red_live_old_member', is_active: true, created_at: new Date().toISOString() };
  let rotationMode = 'success';
  await member.route('**/api/user', route => route.fulfill({ json: { profile: profile('member-token'), apiKey: displayedKey } }));
  await member.route('**/api/user/api-key/rotate', route => {
    assert.equal(route.request().headers().authorization, 'Bearer member-token');
    if (rotationMode === 'failed') return route.fulfill({ status: 503, json: { error: 'Rotasi gagal untuk pengujian.' } });
    if (rotationMode === 'wrong-owner') return route.fulfill({ json: { apiKey: { ...displayedKey, user_id: ids['test-token'], key: 'not_our_key' } } });
    displayedKey = { ...displayedKey, id: 'test-key-new', key: 'red_live_new_member' };
    return route.fulfill({ json: { apiKey: displayedKey } });
  });
  await member.goto(base + '/?tab=profile');
  const keyField = member.getByRole('textbox', { name: 'API key', exact: true });
  await keyField.waitFor(); assert.equal(await keyField.inputValue(), 'red_live_old_member');
  member.once('dialog', dialog => dialog.accept());
  await member.getByRole('button', { name: 'REGENERATE API KEY', exact: true }).click();
  await member.getByText('API key baru dibuat. Semua key lama sudah dinonaktifkan.', { exact: true }).waitFor();
  assert.equal(await keyField.inputValue(), 'red_live_new_member');
  rotationMode = 'failed'; member.once('dialog', dialog => dialog.accept());
  await member.getByRole('button', { name: 'REGENERATE API KEY', exact: true }).click();
  await member.getByText('Rotasi gagal untuk pengujian.', { exact: true }).waitFor();
  await member.waitForFunction(() => document.querySelector('input[aria-label="API key"]')?.value === 'red_live_new_member');
  rotationMode = 'wrong-owner'; member.once('dialog', dialog => dialog.accept());
  await member.getByRole('button', { name: 'REGENERATE API KEY', exact: true }).click();
  await member.getByText('Respons API key tidak valid.', { exact: true }).waitFor();
  await member.waitForFunction(() => document.querySelector('input[aria-label="API key"]')?.value === 'red_live_new_member');
  console.log('PASS key rotation updates the vault, errors recover state and foreign-account keys are rejected');
  await member.close();

  const admin = await newPage('test-token', 1280);
  let categories = [];
  await admin.route('**/api/categories', route => {
    if (route.request().method() === 'POST') categories.push(route.request().postDataJSON().name);
    return route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, json: { categories } });
  });
  await admin.route('**/api/portal/admin/announcements',route=>route.fulfill({json:[]}));
  await admin.route('**/api/portal/admin/orders',route=>route.fulfill({json:[]}));
  await admin.route('**/api/portal/admin/payment-settings',route=>route.fulfill({json:{qrisReady:false,note:''}}));
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
  for (const [id, title] of [['new-endpoint', 'Tambah Endpoint'], ['categories', 'Kategori'], ['users', 'Manajemen Pengguna'], ['logs', 'Log Akses'], ['settings', 'Pengaturan Sistem'], ['announcements','Pengumuman'], ['payments','Pembayaran'], ['endpoints', 'Endpoint Registry']]) {
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
  // Cancel dangerous actions before making any mutation.
  let mutations = 0;
  await admin.route('**/api/admin/maintenance',route => { mutations++; return route.fulfill({json:{maintenance_mode:true}}); });
  await admin.goto(base + '/admin/settings');
  await admin.getByRole('button',{name:'TOGGLE',exact:true}).click();
  await admin.getByRole('dialog',{name:'Aktifkan maintenance?'}).waitFor();
  await admin.getByRole('button',{name:'Batal',exact:true}).click();
  assert.equal(mutations,0);
  const memberProfile = profile('member-token');
  await admin.route('**/api/admin/users',route=>route.fulfill({json:[memberProfile]}));
  await admin.route('**/api/admin/users/*',route=>{mutations++;return route.fulfill({json:{deleted:true}});});
  await admin.goto(base+'/admin/users');
  await admin.getByRole('button',{name:'DELETE',exact:true}).click();
  const deleteModal=admin.getByRole('dialog',{name:'Hapus akun permanen?'});
  await deleteModal.waitFor();
  assert.equal(await deleteModal.getByRole('button',{name:'Ya, lanjutkan',exact:true}).isDisabled(),true);
  await deleteModal.getByRole('textbox').fill(memberProfile.email);
  assert.equal(await deleteModal.getByRole('button',{name:'Ya, lanjutkan',exact:true}).isEnabled(),true);
  await admin.keyboard.press('Escape');
  assert.equal(mutations,0);
  // Message edits are independent of the maintenance switch and survive a refresh while typing.
  let savedMaintenance={maintenance_mode:false,maintenance_message:'Pesan sebelumnya'};
  await admin.route('**/api/admin/system',route=>route.fulfill({json:savedMaintenance}));
  await admin.route('**/api/admin/maintenance',route=>{
    assert.equal(route.request().headers()['x-confirm-action'],'maintenance');
    const body=route.request().postDataJSON();
    if ('message' in body) {assert.equal('active' in body,false);savedMaintenance.maintenance_message=body.message;}
    if ('active' in body) savedMaintenance.maintenance_mode=body.active;
    return route.fulfill({json:savedMaintenance});
  });
  await admin.goto(base+'/admin/settings');
  const messageField=admin.getByLabel('Pesan pop up maintenance',{exact:true});
  await messageField.fill('Maintenance terjadwal\nKami segera kembali.');
  await admin.getByRole('button',{name:'Coba lagi / Refresh',exact:true}).click();
  assert.equal(await messageField.inputValue(),'Maintenance terjadwal\nKami segera kembali.');
  await admin.getByRole('button',{name:'Simpan pesan maintenance',exact:true}).click();
  const saveDialog=admin.getByRole('dialog',{name:'Simpan pesan maintenance?'});await saveDialog.waitFor();const saveResponse=admin.waitForResponse(r=>r.url().endsWith('/api/admin/maintenance')&&r.request().method()==='POST');await saveDialog.getByRole('button',{name:'Ya, lanjutkan',exact:true}).click();
  await saveResponse;await saveDialog.waitFor({state:'hidden'});await admin.getByRole('button',{name:'Simpan pesan maintenance',exact:true}).isDisabled();
  assert.equal(savedMaintenance.maintenance_mode,false);
  assert.equal(savedMaintenance.maintenance_message,'Maintenance terjadwal\nKami segera kembali.');
  await admin.getByRole('button',{name:'TOGGLE',exact:true}).click();await admin.getByRole('dialog',{name:'Aktifkan maintenance?'}).getByRole('button',{name:'Ya, lanjutkan',exact:true}).click();
  await admin.getByText('STATUS: ACTIVE (503)',{exact:true}).waitFor();assert.equal(savedMaintenance.maintenance_message,'Maintenance terjadwal\nKami segera kembali.');
  console.log('PASS editable maintenance message saves without toggling and toggle preserves saved message');
  console.log('PASS maintenance and account deletion require explicit confirmation; cancel/Escape send no mutations');

  // Maintenance is a blocking dialog with no close control; removing it exposes no site content.
  const blocked=await newPage('member-token',360);
  await blocked.route('**/api/portal/state',route=>route.fulfill({json:{maintenance:{active:true,message:'Pemeliharaan terjadwal'},announcements:[],qrisReady:false,serverTime:new Date().toISOString()}}));
  await blocked.goto(base+'/');
  const maintenanceModal=blocked.getByRole('dialog',{name:'Sedang maintenance'});
  await maintenanceModal.waitFor();assert.equal(await maintenanceModal.evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(220, 38, 38)');await blocked.keyboard.press('Escape');assert.equal(await maintenanceModal.isVisible(),true);
  assert.equal(await blocked.getByRole('button',{name:'Tutup',exact:true}).count(),0);
  await blocked.evaluate(()=>document.querySelector('dialog').remove());
  assert.equal(await blocked.getByText('FAST, RELIABLE',{exact:false}).count(),0);
  await blocked.close();
  console.log('PASS maintenance dialog cannot close with Escape and protected content is absent behind it');

  // Announcement content is rendered as text and can be dismissed.
  const notices=await newPage();
  await notices.route('**/api/portal/state',route=>route.fulfill({json:{maintenance:{active:false,message:''},announcements:[{id:'test-notice',title:'Info terbaru',message:'<img src=x onerror="window.__noticeXss=1">',expiresAt:new Date(Date.now()+60000).toISOString()}],qrisReady:false,serverTime:new Date().toISOString()}}));
  await notices.goto(base+'/');await notices.getByRole('dialog',{name:'Info terbaru'}).waitFor();
  assert.equal(await notices.evaluate(()=>window.__noticeXss),undefined);assert.equal(await notices.locator('img[src="x"]').count(),0);
  await notices.getByRole('button',{name:'Tutup',exact:true}).click();await notices.reload();await notices.getByText('FAST, RELIABLE',{exact:false}).waitFor();
  assert.equal(await notices.getByRole('dialog',{name:'Info terbaru'}).count(),0);await notices.close();

  const tester=await newPage('member-token',360);
  await tester.route('**/api/user',route=>route.fulfill({json:{profile:memberProfile,apiKey:{user_id:memberProfile.id,key:'red_live_fixture',is_active:true}}}));
  await tester.route('**/api/categories',route=>route.fulfill({json:{categories:['Stalk']}}));
  await tester.route('**/api/endpoints',route=>route.fulfill({json:[{id:1,name:'FF fixture',category:'Stalk',method:'GET',path:'/api/stalk/ff',min_plan:'free',status:'active',description:'Fixture',params:[{name:'uid',type:'string',required:true}]}]}));
  let release;
  await tester.route('**/api/proxy/**',async route=>{await new Promise(resolve=>{release=resolve;});await route.fulfill({json:{status:true,result:{nickname:'Fixture'}}});});
  await tester.goto(base+'/?tab=docs');
  const card=tester.getByRole('button',{name:/FF fixture/});await card.waitFor();assert.equal(await card.getAttribute('aria-expanded'),'false');await card.click();
  await tester.getByRole('textbox',{name:'uid',exact:true}).fill('12345678');await tester.getByRole('button',{name:'EXECUTE REQUEST',exact:true}).click();
  await tester.getByText('Menjalankan endpoint, menunggu respons...',{exact:true}).waitFor();assert.equal(await tester.locator('[aria-busy="true"]').count(),1);
  release();await tester.getByText('200 OK',{exact:true}).waitFor();assert.equal(await tester.locator('[aria-busy="true"]').count(),0);await tester.close();
  console.log('PASS announcements escape markup and remember dismissal; tester opens closed and shows execution animation until JSON arrives');
  // Manual checkout and review use fixed server orders and private image requests.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPV8AAAAASUVORK5CYII=','base64');
  let checkoutOrder=null;
  const buyer=await newPage('member-token',360);
  await buyer.route('**/api/portal/state',route=>route.fulfill({json:{maintenance:{active:false,message:''},announcements:[],qrisReady:true,serverTime:new Date().toISOString()}}));
  await buyer.route('**/api/portal/orders',route=>{
    assert.equal(route.request().headers().authorization,'Bearer member-token');
    if(route.request().method()==='POST'){
      assert.deepEqual(route.request().postDataJSON(),{plan:'basic'});
      checkoutOrder={id:'20000000-0000-0000-0000-000000000001',reference:'TEST0001',plan:'basic',amount:25000,days:30,status:'awaiting_proof',createdAt:new Date().toISOString(),proofAvailable:false};
      return route.fulfill({status:201,json:checkoutOrder});
    }
    return route.fulfill({json:{orders:checkoutOrder?[checkoutOrder]:[],subscription:null}});
  });
  await buyer.route('**/api/portal/orders/*/qris',route=>route.fulfill({contentType:'image/png',body:png}));
  await buyer.route('**/api/portal/orders/*/proof',route=>{
    assert.equal(route.request().headers().authorization,'Bearer member-token');
    if(route.request().method()==='POST'){assert.match(route.request().postDataJSON().image,/^data:image\/png;base64,/);checkoutOrder.status='submitted';checkoutOrder.proofAvailable=true;return route.fulfill({json:checkoutOrder});}
    return route.fulfill({contentType:'image/png',body:png});
  });
  await buyer.goto(base+'/?tab=pricing');await buyer.getByRole('button',{name:'Beli Basic',exact:true}).click();
  const checkout=buyer.getByRole('dialog',{name:'Pembayaran #TEST0001'});await checkout.waitFor();await checkout.getByRole('img',{name:'QRIS pembayaran',exact:true}).waitFor();
  await checkout.getByLabel('Bukti transfer',{exact:false}).setInputFiles({name:'proof.png',mimeType:'image/png',buffer:png});await checkout.getByRole('button',{name:'Kirim bukti pembayaran',exact:true}).click();await checkout.getByText('Menunggu persetujuan admin',{exact:true}).waitFor();
  assert.equal(checkoutOrder.status,'submitted');assert.equal(await buyer.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await buyer.close();
  await admin.route('**/api/portal/admin/orders',route=>route.fulfill({json:[{...checkoutOrder,email:memberProfile.email}]}));
  await admin.route('**/api/portal/orders/*/proof',route=>route.fulfill({contentType:'image/png',body:png}));
  let approvals=0;
  await admin.route('**/api/portal/admin/orders/*/approve',route=>{assert.equal(route.request().headers()['x-confirm-action'],'approve-payment');approvals++;checkoutOrder.status='approved';return route.fulfill({json:checkoutOrder});});
  await admin.goto(base+'/admin/payments');await admin.getByRole('button',{name:/TEST0001/}).click();await admin.getByRole('img',{name:'Bukti transfer pelanggan',exact:true}).waitFor();await admin.getByRole('button',{name:'Setujui pembayaran',exact:true}).click();
  const approval=admin.getByRole('dialog',{name:'Setujui pembayaran?'});await approval.waitFor();assert.equal(approvals,0);await approval.getByRole('button',{name:'Ya, lanjutkan',exact:true}).click();await admin.getByRole('dialog',{name:'Pesanan #TEST0001'}).waitFor({state:'hidden'});assert.equal(approvals,1);
  console.log('PASS mobile QRIS checkout, transfer-proof upload and admin approval with confirmation');
  const vipBuyer=await newPage('member-token',360);
  await vipBuyer.route('**/api/user',route=>route.fulfill({json:{profile:{...memberProfile,plan:'vip',limit_daily:15000},apiKey:null}}));
  await vipBuyer.route('**/api/portal/state',route=>route.fulfill({json:{maintenance:{active:false,message:''},announcements:[],qrisReady:true,serverTime:new Date().toISOString()}}));
  await vipBuyer.route('**/api/portal/orders',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({json:{orders:[],subscription:null,currentPlan:'vip'}});});
  await vipBuyer.goto(base+'/?tab=pricing');
  await vipBuyer.getByRole('button',{name:'Paket lebih rendah',exact:true}).waitFor();
  assert.equal(await vipBuyer.getByRole('button',{name:'Paket lebih rendah',exact:true}).isDisabled(),true);
  assert.equal(await vipBuyer.getByRole('button',{name:'Beli VIP',exact:true}).isEnabled(),true);
  assert.equal(await vipBuyer.getByRole('button',{name:'Beli Enterprise',exact:true}).isEnabled(),true);
  assert.equal(await vipBuyer.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await vipBuyer.close();
  console.log('PASS VIP users cannot buy Basic; renewal and upgrades remain enabled');

  assert.equal((await admin.request.get(base+'/api/portal/admin/qris')).status(),401);
  assert.equal((await admin.request.get(base+'/api/portal/admin/payment-settings')).status(),401);
  assert.equal((await admin.request.post(base+'/api/portal/orders',{headers:{Origin:'https://evil.example',Authorization:'Bearer member-token'},data:{plan:'basic'}})).status(),403);
  adminBanned = true;
  await admin.goto(base + '/admin/users'); await admin.waitForURL(base + '/'); adminBanned = false;
  console.log('PASS admin-only cookie/navigation, separate pages, categories, mobile layout, Escape, CSP nonce and fresh ban enforcement');
  await admin.close();
  assert.equal((await fetch(base + '/api/user')).status, 401);
} finally { await browser.close(); await new Promise(resolve => provider.close(resolve)); }

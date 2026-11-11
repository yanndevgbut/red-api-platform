import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
const first = '10000000-0000-0000-0000-000000000001';
const second = '10000000-0000-0000-0000-000000000002';
const admin = '10000000-0000-0000-0000-000000000003';

test('migrations: registry authorization, account isolation, rotation and signup', async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;`);
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  for (const name of ['20261108000000_harden_api.sql', '20261108010000_fix_panel_access.sql', '20261108010000_fix_panel_access.sql']) {
    await db.exec(await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));
  }
  const retired = ["/api/ai/chat", "/api/ai/gpt", "/api/download/tiktok", "/api/download/instagram", "/api/stalk/ml", "/api/tools/ssweb", "/api/whatsapp/chinfo"];
  for (const path of retired) await db.query("INSERT INTO endpoints (name, category, method, path) VALUES ('Retired fixture', 'Test', 'GET', $1)", [path]);
  await db.exec("INSERT INTO endpoints (name, category, method, path, min_plan) VALUES ('Test endpoint', 'Test', 'GET', '/api/tools/security-test', 'free'), ('Paid test endpoint', 'Test', 'GET', '/api/tools/paid-test', 'basic')");
  const removal = await readFile(new URL('../supabase/migrations/20261112000000_remove_beta_endpoints.sql', import.meta.url), 'utf8');
  await db.exec(removal);
  await db.exec(removal);
  assert.deepEqual((await db.query('SELECT path FROM endpoints ORDER BY path')).rows.map(row => row.path), ['/api/tools/paid-test', '/api/tools/security-test'], 'retirement removes only the targeted registrations and is repeatable');
  await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    INSERT INTO auth.users VALUES ('${first}', 'same@example.com', '{}'), ('${second}', 'same@other.com', '{}'), ('${admin}', 'admin@example.com', '{}');
    UPDATE profiles SET role='admin' WHERE id='${admin}';`);
  const names = (await db.query('SELECT username FROM profiles')).rows.map(x => x.username);
  assert.equal(new Set(names).size, 3, 'same email prefixes can sign up');
  const key = (await db.query('SELECT key FROM api_keys WHERE user_id=$1', [first])).rows[0].key;
  const authorize = async path => (await db.query(`SELECT * FROM authorize_api_request($1, 'GET', $2, 'free')`, [key, path])).rows[0];
  assert.equal((await authorize('/api/tools/security-test')).valid, true);
  assert.equal((await authorize('/api/ai/deleted')).reason, 'ENDPOINT_UNAVAILABLE');
  assert.equal((await authorize('/api/tools/paid-test')).reason, 'PLAN_REQUIRED');
  await db.exec("UPDATE endpoints SET status='maintenance' WHERE path='/api/tools/security-test'");
  assert.equal((await authorize('/api/tools/security-test')).reason, 'ENDPOINT_MAINTENANCE');
  assert.equal((await db.query('SELECT limit_remaining FROM profiles WHERE id=$1', [first])).rows[0].limit_remaining, 99, 'denials do not deduct quota');
  await db.exec("UPDATE endpoints SET status='active' WHERE path='/api/tools/security-test'");
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${first}', false);`);
  assert.equal((await db.query('SELECT id FROM profiles')).rows.length, 1, 'RLS limits account reads without recursion');
  assert.equal((await db.query("UPDATE profiles SET role='admin' RETURNING id")).rows.length, 0, 'users cannot elevate their role');
  assert.equal((await db.query('SELECT key FROM api_keys')).rows.length, 1, 'keys isolated');
  await assert.rejects(db.query(`SELECT * FROM authorize_api_request($1, 'GET', '/api/tools/security-test', 'free')`, [key]), /permission denied/);
  await db.exec('SELECT rotate_my_api_key(); RESET ROLE;');
  assert.equal((await authorize('/api/tools/security-test')).reason, 'INVALID_API_KEY', 'rotation invalidates old key');
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${admin}', false);`);
  assert.equal((await db.query('SELECT id FROM profiles')).rows.length, 3, 'admin policies allow panel data');
  await db.exec(`RESET ROLE; UPDATE profiles SET banned=true WHERE id='${admin}'; SET ROLE authenticated;`);
  assert.equal((await db.query('SELECT id FROM profiles')).rows.length, 1, 'banned admin loses broad access');
  await assert.rejects(db.exec('SELECT rotate_my_api_key()'), /active account/);
  await db.close();
});

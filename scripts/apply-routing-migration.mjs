/**
 * Apply zafirix_routing_records migration to the connected Supabase project.
 *
 * Run: node scripts/apply-routing-migration.mjs
 *   or: npm run apply:routing-migration
 *
 * Auth (first match wins):
 *   1. SUPABASE_ACCESS_TOKEN  → Management API POST /v1/projects/{ref}/database/query
 *   2. DATABASE_URL or DIRECT_URL → pg client
 *   3. SUPABASE_DB_PASSWORD (+ auto pooler host for project ref)
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATION_FILE = path.join(ROOT, 'supabase/migrations/20260602030000_routing_registry.sql');
const MIGRATION_NAME = '20260602030000_routing_registry';

const POOLER_REGIONS = [
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'us-east-1',
  'us-west-1',
  'ap-southeast-1',
];

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return env;
}

function projectRef(supabaseUrl) {
  return supabaseUrl.replace('https://', '').split('.')[0];
}

async function tableExists(url, key) {
  const res = await fetch(`${url}/rest/v1/zafirix_routing_records?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.ok;
}

async function applyViaManagementApi({ accessToken, ref, sql }) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Management API query failed (${res.status}): ${body.slice(0, 400)}`);
  }
  return body;
}

async function applyViaPg(connectionString, sql) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query(sql);
  } finally {
    await client.end().catch(() => {});
  }
}

function buildPoolerUrls(ref, password) {
  const encoded = encodeURIComponent(password);
  return POOLER_REGIONS.map(
    (region) =>
      `postgresql://postgres.${ref}:${encoded}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`,
  );
}

async function resolvePgConnectionString(env, ref) {
  const direct = env.DATABASE_URL ?? env.DIRECT_URL ?? process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (direct) return { connectionString: direct, source: 'DATABASE_URL' };

  const password = env.SUPABASE_DB_PASSWORD ?? process.env.SUPABASE_DB_PASSWORD;
  if (!password) return null;

  for (const connectionString of buildPoolerUrls(ref, password)) {
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      return { connectionString, source: 'SUPABASE_DB_PASSWORD pooler' };
    } catch {
      await client.end().catch(() => {});
    }
  }
  throw new Error('SUPABASE_DB_PASSWORD set but pooler connection failed in all regions');
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const ref = projectRef(url);
  console.log(`\n=== Apply routing migration (${ref}) ===\n`);

  if (await tableExists(url, key)) {
    console.log('✓ zafirix_routing_records already exists — nothing to do.\n');
    return;
  }

  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error(`Migration file missing: ${MIGRATION_FILE}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const accessToken = env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;

  if (accessToken) {
    console.log('→ Applying via Supabase Management API…');
    await applyViaManagementApi({ accessToken, ref, sql });
    console.log('✓ Migration applied via Management API');
  } else {
    const pgConn = await resolvePgConnectionString(env, ref);
    if (!pgConn) {
      console.error('Cannot apply migration: no database credentials found.\n');
      console.error('Add ONE of these to .env.local, then re-run:');
      console.error('  SUPABASE_ACCESS_TOKEN=<personal token from https://supabase.com/dashboard/account/tokens>');
      console.error('  DATABASE_URL=<postgres connection string from Supabase → Settings → Database>');
      console.error('  SUPABASE_DB_PASSWORD=<database password>  (auto-detects pooler region)\n');
      process.exit(1);
    }
    console.log(`→ Applying via Postgres (${pgConn.source})…`);
    await applyViaPg(pgConn.connectionString, sql);
    console.log('✓ Migration applied via Postgres');
  }

  const ok = await tableExists(url, key);
  if (!ok) {
    console.error('✗ Migration ran but zafirix_routing_records is not visible via REST yet.');
    console.error('  Wait a few seconds and re-run, or check Supabase schema cache.');
    process.exit(1);
  }

  console.log('✓ zafirix_routing_records verified via REST');
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('\n✗ Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

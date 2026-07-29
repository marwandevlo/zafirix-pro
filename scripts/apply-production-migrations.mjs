/**
 * Apply missing production Supabase migrations (AI copilot + enterprise modules + RLS).
 *
 * Run: npm run apply:production-migrations
 *
 * Requires ONE of in .env.local:
 *   SUPABASE_ACCESS_TOKEN  (https://supabase.com/dashboard/account/tokens)
 *   DATABASE_URL / DIRECT_URL
 *   SUPABASE_DB_PASSWORD   (auto-detects pooler region)
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');

const STEPS = [
  {
    label: 'AI copilot baseline',
    file: 'ensure_atlas_ai_copilot_baseline.sql',
    probeTable: 'atlas_ai_interactions',
  },
  {
    label: 'Enterprise modules',
    file: '20260729160000_zafirix_enterprise_modules.sql',
    probeTable: 'zafirix_stores',
  },
  {
    label: 'Enterprise + core RLS fix',
    file: '20260729170000_zafirix_rls_crud_fix.sql',
    probeTable: null,
  },
];

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

async function tableExists(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
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
    throw new Error(`Management API query failed (${res.status}): ${body.slice(0, 500)}`);
  }
}

async function applyViaPg(connectionString, sql) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
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

async function applySql(env, ref, sql) {
  const accessToken = env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;
  if (accessToken) {
    await applyViaManagementApi({ accessToken, ref, sql });
    return 'Management API';
  }
  const pgConn = await resolvePgConnectionString(env, ref);
  if (!pgConn) return null;
  await applyViaPg(pgConn.connectionString, sql);
  return pgConn.source;
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
  console.log(`\n=== Apply production migrations (${ref}) ===\n`);

  let applied = 0;
  for (const step of STEPS) {
    const filePath = path.join(MIGRATIONS_DIR, step.file);
    if (!fs.existsSync(filePath)) {
      console.error(`✗ Missing migration file: ${step.file}`);
      process.exit(1);
    }

    if (step.probeTable && (await tableExists(url, key, step.probeTable))) {
      console.log(`✓ ${step.label} — ${step.probeTable} already exists, skipping`);
      continue;
    }

    console.log(`→ Applying ${step.label} (${step.file})…`);
    const sql = fs.readFileSync(filePath, 'utf8');
    const via = await applySql(env, ref, sql);
    if (!via) {
      console.error('\nCannot apply migrations: no database credentials found.\n');
      console.error('Add ONE of these to .env.local, then re-run:');
      console.error('  SUPABASE_ACCESS_TOKEN=<token from https://supabase.com/dashboard/account/tokens>');
      console.error('  DATABASE_URL=<postgres connection string>');
      console.error('  SUPABASE_DB_PASSWORD=<database password>\n');
      process.exit(1);
    }
    console.log(`  applied via ${via}`);
    applied++;

    if (step.probeTable) {
      await new Promise((r) => setTimeout(r, 2000));
      const ok = await tableExists(url, key, step.probeTable);
      console.log(ok ? `  ✓ verified ${step.probeTable} via REST` : `  ⚠ ${step.probeTable} not visible yet — wait & re-run`);
    }
  }

  console.log(`\nDone. ${applied} migration(s) applied.\n`);
}

main().catch((err) => {
  console.error('\n✗ Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

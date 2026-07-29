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
import { loadProjectEnv, projectRefFromSupabaseUrl } from './load-project-env.mjs';
import { queryViaPg, resolveSupabasePgConnection } from './supabase-pg-connection.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATION_FILE = path.join(ROOT, 'supabase/migrations/20260602030000_routing_registry.sql');

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

async function main() {
  const env = loadProjectEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const ref = projectRefFromSupabaseUrl(url);
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
  const accessToken = env.SUPABASE_ACCESS_TOKEN;

  if (accessToken) {
    console.log('→ Applying via Supabase Management API…');
    await applyViaManagementApi({ accessToken, ref, sql });
    console.log('✓ Migration applied via Management API');
  } else {
    const pgConn = await resolveSupabasePgConnection(env, ref);
    if (!pgConn) {
      console.error('Cannot apply migration: no database credentials found.\n');
      console.error('Add to .env.local:');
      console.error('  SUPABASE_POOLER_REGION=eu-west-1');
      console.error('  SUPABASE_DB_PASSWORD=<database password from Supabase → Settings → Database>\n');
      process.exit(1);
    }
    console.log(`→ Applying via Postgres (${pgConn.source})…`);
    await queryViaPg(pgConn.connectionString, sql);
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

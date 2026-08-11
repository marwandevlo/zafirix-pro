/**
 * Apply Zafirix usage subscriptions + meters migration.
 * Run: node scripts/apply-zafirix-usage-subscriptions.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadProjectEnv, projectRefFromSupabaseUrl } from './load-project-env.mjs';
import { resolveSupabasePgConnection } from './supabase-pg-connection.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'supabase/migrations/20260811240000_zafirix_usage_subscriptions.sql');

async function queryRows(connectionString, sql) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  try {
    await client.connect();
    return await client.query(sql);
  } finally {
    await client.end().catch(() => {});
  }
}

const env = loadProjectEnv();
const ref = projectRefFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '');
if (!ref) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL project ref.');
  process.exit(1);
}

const conn = await resolveSupabasePgConnection(env, ref);
if (!conn) {
  console.error('No database credentials.');
  process.exit(1);
}

console.log(`Applying zafirix usage subscriptions via ${conn.source}…`);
await queryRows(conn.connectionString, fs.readFileSync(FILE, 'utf8'));
console.log('Migration applied.');

const tables = await queryRows(
  conn.connectionString,
  `select table_name from information_schema.tables
   where table_schema = 'public'
     and table_name in (
       'zafirix_subscriptions',
       'zafirix_usage_meters',
       'zafirix_addon_packs',
       'zafirix_addon_purchases',
       'zafirix_plan_limits'
     )
   order by 1`,
);
console.log('Tables:', tables.rows.map((r) => r.table_name).join(', '));

const packs = await queryRows(
  conn.connectionString,
  `select code, meter_code, quantity, price_mad from public.zafirix_addon_packs order by sort_order`,
);
console.log('Addon packs:', packs.rows.length);

await queryRows(conn.connectionString, `notify pgrst, 'reload schema'`);
console.log('PostgREST schema reload notified.');

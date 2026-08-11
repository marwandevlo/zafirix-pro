/**
 * One-shot: apply logistics COD hardening migration and verify tables.
 * Run: node scripts/apply-logistics-hardening.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadProjectEnv, projectRefFromSupabaseUrl } from './load-project-env.mjs';
import { resolveSupabasePgConnection } from './supabase-pg-connection.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'supabase/migrations/20260811220000_zafirix_logistics_cod_hardening.sql');

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
  console.error('No database credentials (SUPABASE_DB_PASSWORD / DATABASE_URL).');
  process.exit(1);
}

console.log(`Applying logistics hardening via ${conn.source}…`);
const sql = fs.readFileSync(FILE, 'utf8');
await queryRows(conn.connectionString, sql);
console.log('Migration applied.');

const tables = await queryRows(
  conn.connectionString,
  `select table_name from information_schema.tables
   where table_schema = 'public'
     and table_name in (
       'zafirix_deliveries',
       'zafirix_delivery_partners',
       'zafirix_shipment_tracking_events',
       'zafirix_cod_reconciliations'
     )
   order by 1`,
);
console.log('Tables present:', tables.rows.map((r) => r.table_name).join(', ') || '(none)');

const cols = await queryRows(
  conn.connectionString,
  `select column_name from information_schema.columns
   where table_schema = 'public'
     and table_name = 'zafirix_deliveries'
     and column_name in ('partner_id', 'tracking_id', 'notes')
   order by 1`,
);
console.log('Delivery COD columns:', cols.rows.map((r) => r.column_name).join(', ') || '(none)');

const indexes = await queryRows(
  conn.connectionString,
  `select indexname from pg_indexes
   where schemaname = 'public'
     and tablename in (
       'zafirix_deliveries',
       'zafirix_delivery_partners',
       'zafirix_shipment_tracking_events',
       'zafirix_cod_reconciliations'
     )
   order by 1`,
);
console.log(`Indexes: ${indexes.rows.length} on logistics tables`);

await queryRows(conn.connectionString, `notify pgrst, 'reload schema'`);
console.log('PostgREST schema reload notified.');

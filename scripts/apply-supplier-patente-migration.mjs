/**
 * Apply supplier_patente column migration to Supabase.
 *
 * Run: node scripts/apply-supplier-patente-migration.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadProjectEnv, projectRefFromSupabaseUrl } from './load-project-env.mjs';
import { queryViaPg, resolveSupabasePgConnection } from './supabase-pg-connection.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATION_FILE = path.join(ROOT, 'supabase/migrations/20260802120000_atlas_supplier_patente.sql');

const VERIFY_SQL = `
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'atlas_supplier_invoices'
    and column_name = 'supplier_patente'
`;

async function columnExists(connectionString) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  try {
    await client.connect();
    const { rows } = await client.query(VERIFY_SQL);
    return rows[0] ?? null;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const env = loadProjectEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL in .env.local');
    process.exit(1);
  }

  const ref = projectRefFromSupabaseUrl(url);
  console.log(`\n=== Apply supplier_patente migration (${ref}) ===\n`);

  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error(`Migration file missing: ${MIGRATION_FILE}`);
    process.exit(1);
  }

  const pgConn = await resolveSupabasePgConnection(env, ref);
  if (!pgConn) {
    console.error('Cannot apply migration: no database credentials found.');
    console.error('Add SUPABASE_DB_PASSWORD or DATABASE_URL to .env.local');
    process.exit(1);
  }

  const existing = await columnExists(pgConn.connectionString);
  if (existing) {
    console.log('✓ supplier_patente already exists — nothing to do.');
    console.log(`  column: ${existing.column_name} (${existing.data_type}, nullable=${existing.is_nullable})\n`);
    return;
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  console.log(`→ Applying via ${pgConn.source}…`);
  await queryViaPg(pgConn.connectionString, sql);
  console.log('✓ Migration SQL executed');

  const verified = await columnExists(pgConn.connectionString);
  if (!verified) {
    console.error('✗ supplier_patente column not found after migration');
    process.exit(1);
  }

  console.log(`✓ Verified: ${verified.column_name} (${verified.data_type}, nullable=${verified.is_nullable})`);
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('\n✗ Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

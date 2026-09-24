/**
 * Apply the freemium usage-limits migration via Supabase Management API.
 * Uses SUPABASE_ACCESS_TOKEN (or --token=). Never logs the token.
 *
 *   node scripts/apply-freemium-migration.mjs
 *   node scripts/apply-freemium-migration.mjs --token=sbp_...
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadProjectEnv, projectRefFromSupabaseUrl } from './load-project-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20260924160000_freemium_usage_limits.sql');
const DEFAULT_REF = 'kwylivmhlcuflubyubdv';
const PLACEHOLDER_RE = /ضع_التوكن_هنا|put.?the.?token|your.?token|xxxxxxxx/i;

function cliToken() {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--token='));
  return arg ? arg.slice(8).trim() : '';
}

function isUsableToken(value) {
  if (!value || !value.startsWith('sbp_')) return false;
  if (PLACEHOLDER_RE.test(value)) return false;
  return value.length > 20;
}

async function runQuery(ref, accessToken, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    const detail = typeof json === 'string' ? json.slice(0, 400) : JSON.stringify(json).slice(0, 400);
    throw new Error(`Management API ${res.status}: ${detail}`);
  }
  return json;
}

const VERIFY_SQL = `
select
  to_regclass('public.atlas_workspace_usage_cycles') is not null as usage_cycles_table,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'atlas_workspaces' and column_name = 'subscription_plan'
  ) as workspaces_subscription_plan,
  exists (
    select 1 from public.atlas_plan_features pf
    join public.atlas_subscription_plans p on p.id = pf.plan_id
    where p.code = 'FREE' and pf.feature_code = 'invoices_quotes_per_month' and pf.limit_value = 15
  ) as free_invoice_limit,
  exists (
    select 1 from public.atlas_plan_features pf
    join public.atlas_subscription_plans p on p.id = pf.plan_id
    where p.code = 'FREE' and pf.feature_code = 'ocr_limit' and pf.limit_value = 5
  ) as free_ocr_limit,
  exists (select 1 from pg_proc where proname = 'atlas_freemium_check') as rpc_check,
  exists (select 1 from pg_proc where proname = 'atlas_freemium_consume') as rpc_consume,
  exists (select 1 from pg_proc where proname = 'atlas_freemium_ensure_cycle') as rpc_ensure_cycle;
`;

async function main() {
  const env = loadProjectEnv();
  const ref = projectRefFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL || '') || DEFAULT_REF;
  const token = cliToken() || env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN || '';

  if (!isUsableToken(token)) {
    console.error('No usable SUPABASE_ACCESS_TOKEN.');
    console.error('The value provided was a placeholder (sbp_ضع_التوكن_هنا), not a real token.');
    console.error('Create a token at https://supabase.com/dashboard/account/tokens then run:');
    console.error('  node scripts/apply-freemium-migration.mjs --token=sbp_YOUR_REAL_TOKEN');
    process.exit(2);
  }

  if (!fs.existsSync(MIGRATION)) {
    console.error(`Missing ${MIGRATION}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION, 'utf8');
  console.log(`Applying freemium migration to ${ref} via Management API…`);
  await runQuery(ref, token, sql);
  console.log('SQL applied. Verifying objects…');

  const verify = await runQuery(ref, token, VERIFY_SQL);
  const row = Array.isArray(verify) ? verify[0] : verify;
  console.log(JSON.stringify(row, null, 2));

  const ok =
    row?.usage_cycles_table &&
    row?.workspaces_subscription_plan &&
    row?.free_invoice_limit &&
    row?.free_ocr_limit &&
    row?.rpc_check &&
    row?.rpc_consume &&
    row?.rpc_ensure_cycle;

  if (!ok) {
    console.error('Verification failed: one or more objects are missing.');
    process.exit(1);
  }
  console.log('Verified: usage table, subscription_plan column, FREE limits, and freemium RPCs are present.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * Run: node scripts/verify-supabase-schema.mjs
 * Loads .env.local and checks required Supabase tables/columns.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const REQUIRED_TABLES = [
  'profiles',
  'atlas_companies',
  'atlas_clients',
  'atlas_invoices',
  'atlas_payments',
  'atlas_documents',
  'atlas_supplier_invoices',
  'atlas_subscriptions',
  'atlas_payment_requests',
  'atlas_accounting_entries',
  'atlas_agent_conversations',
  'atlas_agent_messages',
  'atlas_agent_tasks',
  'atlas_tva_periods',
];

const PAYMENT_REQUEST_COLUMNS = ['plan_id', 'amount_mad', 'status', 'payment_method', 'manual_provider', 'metadata'];

async function checkTable(name) {
  const r = await fetch(`${url}/rest/v1/${name}?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.ok;
}

async function checkColumn(table, column) {
  const r = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.ok;
}

async function checkBucket(name) {
  const r = await fetch(`${url}/storage/v1/bucket/${name}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.ok;
}

const results = [];
let failed = 0;

for (const t of REQUIRED_TABLES) {
  const ok = await checkTable(t);
  results.push({ check: `table:${t}`, ok });
  if (!ok) failed++;
}

const sourcePageOk = await checkColumn('atlas_supplier_invoices', 'source_page');
results.push({ check: 'column:atlas_supplier_invoices.source_page', ok: sourcePageOk });
if (!sourcePageOk) failed++;

for (const col of PAYMENT_REQUEST_COLUMNS) {
  const ok = await checkColumn('atlas_payment_requests', col);
  results.push({ check: `column:atlas_payment_requests.${col}`, ok });
  if (!ok) failed++;
}

const bucketOk = await checkBucket('atlas-documents');
results.push({ check: 'storage:atlas-documents', ok: bucketOk });
if (!bucketOk) failed++;

console.log('Supabase schema verification');
console.log('backend:', process.env.NEXT_PUBLIC_ATLAS_DATA_BACKEND ?? '(unset)');
console.log('---');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}`);
}
console.log('---');
console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`);
if (failed > 0) {
  console.log('Hint: run missing baselines in Supabase SQL Editor, e.g.');
  console.log('  supabase/migrations/ensure_atlas_payment_requests_baseline.sql');
  console.log('  supabase/migrations/ensure_atlas_subscriptions_baseline.sql');
  console.log('  supabase/migrations/20260601120000_atlas_agents_real.sql');
}
process.exit(failed === 0 ? 0 : 1);

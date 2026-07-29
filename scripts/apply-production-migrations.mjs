/**
 * Apply missing production Supabase migrations (AI copilot + enterprise modules + RLS).
 *
 * Run: npm run apply:production-migrations
 *
 * Auth (first match wins):
 *   SUPABASE_ACCESS_TOKEN  → Management API
 *   DATABASE_URL           → auto-rewritten to session pooler (IPv4)
 *   SUPABASE_DB_PASSWORD   → builds pooler URL (SUPABASE_POOLER_REGION, default eu-west-1)
 *
 * CLI: --token=...  --password=...  --database-url=...  --verify-only  --save-env
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { appendEnvLocal, loadProjectEnv, projectRefFromSupabaseUrl } from './load-project-env.mjs';
import {
  DEFAULT_POOLER_REGION,
  queryViaPg,
  resolveSupabasePgConnection,
} from './supabase-pg-connection.mjs';

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

const VERIFY_TABLES = [
  'atlas_ai_interactions',
  'atlas_ai_anomalies',
  'atlas_ai_conversations',
  'atlas_ai_context',
  'zafirix_stores',
];

function parseCliArgs() {
  const args = { verifyOnly: false, saveEnv: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--verify-only') args.verifyOnly = true;
    else if (arg === '--save-env') args.saveEnv = true;
    else if (arg.startsWith('--token=')) args.token = arg.slice(8);
    else if (arg.startsWith('--password=')) args.password = arg.slice(11);
    else if (arg.startsWith('--database-url=')) args.databaseUrl = arg.slice(15);
  }
  return args;
}

async function promptLine(question) {
  if (!process.stdin.isTTY) return null;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim() || null));
    });
  } finally {
    rl.close();
  }
}

async function tableExists(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.ok;
}

async function verifyTables(url, key, { retries = 3, delayMs = 2500 } = {}) {
  const results = {};
  for (let attempt = 1; attempt <= retries; attempt++) {
    for (const table of VERIFY_TABLES) {
      results[table] = await tableExists(url, key, table);
    }
    if (Object.values(results).every(Boolean)) break;
    if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
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

async function applySql(env, ref, sql) {
  const accessToken = env.SUPABASE_ACCESS_TOKEN;
  if (accessToken) {
    await applyViaManagementApi({ accessToken, ref, sql });
    return 'Management API';
  }
  const pgConn = await resolveSupabasePgConnection(env, ref);
  if (!pgConn) return null;
  await queryViaPg(pgConn.connectionString, sql);
  return pgConn.source;
}

function printCredentialHelp(ref) {
  console.error('\nCannot apply migrations: no database credentials found.\n');
  console.error('Add to .env.local (recommended — uses IPv4 session pooler):');
  console.error(`  SUPABASE_POOLER_REGION=${DEFAULT_POOLER_REGION}`);
  console.error('  SUPABASE_DB_PASSWORD=<from Supabase → Settings → Database>');
  console.error('\nOr pass on the command line:');
  console.error('  npm run apply:production-migrations -- --password=YOUR_DB_PASSWORD');
  console.error('\nDo NOT use db.' + ref + '.supabase.co (direct) — it fails on IPv4-only networks.');
  console.error('Pooler format (auto-built from password):');
  console.error(`  postgresql://postgres.${ref}:****@aws-0-${DEFAULT_POOLER_REGION}.pooler.supabase.com:6543/postgres\n`);
}

async function resolveCredentials(env, cli) {
  const merged = { ...env };
  if (cli.token) merged.SUPABASE_ACCESS_TOKEN = cli.token;
  if (cli.password) merged.SUPABASE_DB_PASSWORD = cli.password;
  if (cli.databaseUrl) merged.DATABASE_URL = cli.databaseUrl;

  if (!merged.SUPABASE_POOLER_REGION) merged.SUPABASE_POOLER_REGION = DEFAULT_POOLER_REGION;

  const hasCreds =
    merged.SUPABASE_ACCESS_TOKEN || merged.DATABASE_URL || merged.DIRECT_URL || merged.SUPABASE_DB_PASSWORD;

  if (hasCreds || cli.verifyOnly) return { env: merged, cli };

  console.log('\nDatabase password required (Supabase → Settings → Database).\n');
  console.log(`Using session pooler: aws-0-${merged.SUPABASE_POOLER_REGION}.pooler.supabase.com:6543\n`);

  const password = await promptLine('SUPABASE_DB_PASSWORD: ');
  if (password) merged.SUPABASE_DB_PASSWORD = password;

  return { env: merged, cli };
}

async function main() {
  const cli = parseCliArgs();
  const { env, cli: cliFlags } = await resolveCredentials(loadProjectEnv(), cli);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const ref = projectRefFromSupabaseUrl(url);
  console.log(`\n=== Production migrations (${ref}) ===\n`);

  if (cliFlags.verifyOnly) {
    const results = await verifyTables(url, key);
    for (const [table, ok] of Object.entries(results)) {
      console.log(`${ok ? '✓' : '✗'} ${table}`);
    }
    process.exit(Object.values(results).every(Boolean) ? 0 : 1);
  }

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
      printCredentialHelp(ref);
      process.exit(1);
    }
    console.log(`  applied via ${via}`);
    applied++;

    if (cliFlags.saveEnv) {
      appendEnvLocal({
        SUPABASE_POOLER_REGION: env.SUPABASE_POOLER_REGION,
        SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD,
      });
    }

    if (step.probeTable) {
      await new Promise((r) => setTimeout(r, 2000));
      const ok = await tableExists(url, key, step.probeTable);
      console.log(
        ok ? `  ✓ verified ${step.probeTable} via REST` : `  ⚠ ${step.probeTable} not visible yet — schema cache may lag`,
      );
    }
  }

  console.log('\n--- PostgREST schema verification ---');
  const results = await verifyTables(url, key);
  for (const [table, ok] of Object.entries(results)) {
    console.log(`${ok ? '✓' : '✗'} ${table}`);
  }

  const missing = Object.entries(results).filter(([, ok]) => !ok).map(([t]) => t);
  if (missing.length > 0) {
    console.log(`\n⚠ Still missing via REST: ${missing.join(', ')}`);
    console.log('  Re-run in ~30s (migrations are idempotent). SQL includes NOTIFY pgrst reload.\n');
    process.exit(1);
  }

  console.log(`\nDone. ${applied} migration(s) applied. All tables visible via REST.\n`);
}

main().catch((err) => {
  console.error('\n✗ Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

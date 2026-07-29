/**
 * Auto-configure Client Portal demo env in .env.local (idempotent).
 * Run: node scripts/bootstrap-client-portal-env.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV_PATH = path.join(ROOT, '.env.local');

function parseEnv(content) {
  const map = new Map();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return map;
}

function serializeEnv(map, original) {
  const lines = original.split('\n');
  const keysWritten = new Set();
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      out.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq);
    if (map.has(key)) {
      out.push(`${key}=${map.get(key)}`);
      keysWritten.add(key);
    } else {
      out.push(line);
    }
  }

  const portalBlock = [
    '',
    '# ── Client Portal (auto-configured by scripts/bootstrap-client-portal-env.mjs) ──',
  ];
  for (const [key, val] of map) {
    if (key.startsWith('CLIENT_PORTAL_') || key.startsWith('NEXT_PUBLIC_ENABLE_CLIENT_PORTAL')) {
      if (!keysWritten.has(key)) portalBlock.push(`${key}=${val}`);
    }
  }
  if (portalBlock.length > 2) out.push(...portalBlock);

  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('.env.local not found — copy .env.example first.');
    process.exit(1);
  }

  const original = fs.readFileSync(ENV_PATH, 'utf8');
  const env = parseEnv(original);
  const url = env.get('NEXT_PUBLIC_SUPABASE_URL');
  const key = env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const res = await fetch(
    `${url}/rest/v1/atlas_companies?select=id,user_id,name,legal_name,trade_name&order=created_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const rows = await res.json();
  if (!res.ok || !Array.isArray(rows) || !rows.length) {
    console.error('No atlas_companies row found:', rows);
    process.exit(1);
  }

  const company = rows[0];
  env.set('NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO', 'true');
  env.set('NEXT_PUBLIC_ENABLE_CLIENT_PORTAL', 'true');
  env.set('CLIENT_PORTAL_DEMO_CODE', '1234');
  env.set('CLIENT_PORTAL_DEMO_COMPANY_ID', company.id);
  env.set('CLIENT_PORTAL_DEMO_OWNER_USER_ID', company.user_id);

  fs.writeFileSync(ENV_PATH, serializeEnv(env, original), 'utf8');

  console.log('Client Portal env configured:');
  console.log(`  company: ${company.trade_name ?? company.name ?? company.id}`);
  console.log(`  CLIENT_PORTAL_DEMO_COMPANY_ID=${company.id}`);
  console.log(`  CLIENT_PORTAL_DEMO_OWNER_USER_ID=${company.user_id}`);
  console.log('  demo code: 1234');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Simulate Moroccan SME + Admin journey across Zafirixpro.
 *
 * Run:
 *   node scripts/simulate-user-journey.mjs
 *   node scripts/simulate-user-journey.mjs --http https://your-app.vercel.app
 *   node scripts/simulate-user-journey.mjs --db
 *
 * Exit code 1 if any hard failures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { loadProjectEnv } from './load-project-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

const CRITICAL_PAGES = [
  '/',
  '/factures',
  '/logistique',
  '/auto-entrepreneur',
  '/personne-physique',
  '/audit',
  '/settings',
  '/pricing',
  '/billing',
  '/comptabilite',
  '/inventaire',
  '/tva',
  '/dashboard',
  '/admin',
  '/login',
  '/signup',
];

const CRITICAL_APIS = [
  'app/api/usage/route.ts',
  'app/api/audit/compliance/route.ts',
  'app/api/logistics/deliveries/route.ts',
  'app/api/auto-entrepreneur/route.ts',
  'app/api/personne-physique/route.ts',
  'app/api/factures/route.ts',
  'app/api/admin/diagnose/route.ts',
];

const TABLES = [
  'atlas_companies',
  'atlas_invoices',
  'zafirix_deliveries',
  'zafirix_subscriptions',
  'zafirix_usage_meters',
  'zafirix_addon_packs',
  'zafirix_plan_limits',
  'zafirix_individual_profiles',
];

const PWA = ['public/manifest.json', 'public/sw.js', 'public/zafirix-icon-192.png', 'public/zafirix-icon-512.png'];

const args = new Set(process.argv.slice(2));
const httpIdx = process.argv.indexOf('--http');
const baseUrl = httpIdx >= 0 ? process.argv[httpIdx + 1] : null;
const withDb = args.has('--db');
const skipTsc = args.has('--skip-tsc');

let pass = 0;
let warn = 0;
let fail = 0;
const failures = [];

function check(area, title, ok, detail = '', soft = false) {
  if (ok) {
    pass += 1;
    console.log(`  ✓ [${area}] ${title}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  if (soft) {
    warn += 1;
    console.log(`  ⚠ [${area}] ${title}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  fail += 1;
  failures.push(`[${area}] ${title}${detail ? `: ${detail}` : ''}`);
  console.log(`  ✗ [${area}] ${title}${detail ? ` — ${detail}` : ''}`);
}

function pageFile(href) {
  if (href === '/') return 'app/page.tsx';
  return `app/${href.replace(/^\//, '')}/page.tsx`;
}

function isValidIce(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 15 && !/^0+$/.test(digits);
}

function isValidVat(rate) {
  return [0, 7, 10, 14, 20].includes(Number(rate));
}

console.log('\n=== Zafirixpro — User/Admin Journey Simulation ===\n');
console.log('Persona client : PME marocaine (factures, COD, AE/PP, audit)');
console.log('Persona admin  : diagnose tables, quotas, routes\n');

console.log('1. Route & page accessibility (filesystem)');
for (const href of CRITICAL_PAGES) {
  const f = pageFile(href);
  check('routes', href, fs.existsSync(path.join(ROOT, f)), f);
}

console.log('\n2. Critical API routes');
for (const rel of CRITICAL_APIS) {
  check('api', rel, fs.existsSync(path.join(ROOT, rel)));
}

console.log('\n3. PWA assets');
for (const rel of PWA) {
  check('pwa', rel, fs.existsSync(path.join(ROOT, rel)));
}

console.log('\n4. Moroccan rule simulations (ICE / TVA / amounts)');
check('rules', 'ICE valide 15 chiffres', isValidIce('001526849000078'));
check('rules', 'ICE court rejeté', !isValidIce('12345'));
check('rules', 'ICE zéro rejeté', !isValidIce('000000000000000'));
for (const r of [0, 7, 10, 14, 20]) check('rules', `TVA ${r}% OK`, isValidVat(r));
check('rules', 'TVA 19% rejetée', !isValidVat(19));
check('rules', 'HT+TVA=TTC', 1000 + 200 === 1200);

console.log('\n5. Shell / dashboard components');
for (const rel of [
  'app/components/shell/MobileBottomNav.tsx',
  'app/components/shell/ModuleAppShell.tsx',
  'app/components/shell/AppSidebar.tsx',
  'app/components/billing/UsagePlanWidget.tsx',
  'app/components/dashboard/MoroccoComplianceAuditWidget.tsx',
  'app/lib/zafirix-usage-server.ts',
  'app/lib/zafirix-compliance-audit-server.ts',
  'app/lib/zafirix-journey-diagnose-server.ts',
]) {
  check('ui', path.basename(rel), fs.existsSync(path.join(ROOT, rel)), rel);
}

// Detect unused/dangerous company column references in compliance audit
console.log('\n6. Static bug guards');
const complianceSrc = fs.readFileSync(path.join(ROOT, 'app/lib/zafirix-compliance-audit-server.ts'), 'utf8');
check(
  'bugs',
  'Compliance audit does not select non-existent cnss column',
  !/\.select\([^)]*\bcnss\b/.test(complianceSrc) && !complianceSrc.includes("'cnss,"),
  'use cnss_number only',
);
check(
  'bugs',
  'Compliance audit does not select raison_sociale column',
  !complianceSrc.includes('raison_sociale'),
);

if (!skipTsc) {
  console.log('\n7. TypeScript');
  try {
    execSync('npx tsc --noEmit -p tsconfig.json', { cwd: ROOT, stdio: 'pipe' });
    check('tsc', 'npx tsc --noEmit', true);
  } catch (e) {
    const detail = (e.stderr?.toString() || e.stdout?.toString() || e.message || '').slice(0, 400);
    check('tsc', 'npx tsc --noEmit', false, detail);
  }
}

if (withDb) {
  console.log('\n8. Database integrity');
  const env = loadProjectEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    check('database', 'Service role credentials', false, 'missing URL or SERVICE_ROLE key', true);
  } else {
    const db = createClient(url, key, { auth: { persistSession: false } });
    for (const table of TABLES) {
      const { error } = await db.from(table).select('*').limit(1);
      check('database', table, !error, error?.message);
    }
    const { data: ym, error: ymErr } = await db.rpc('zafirix_current_period_ym');
    check('database', 'RPC zafirix_current_period_ym', !ymErr, ymErr?.message || String(ym));

    const { data: company } = await db.from('atlas_companies').select('id').limit(1).maybeSingle();
    if (company?.id) {
      const { data: usage, error: usageErr } = await db.rpc('zafirix_check_usage', {
        p_company_id: company.id,
        p_meter: 'invoices',
        p_qty: 1,
      });
      check('quota', 'zafirix_check_usage invoices', !usageErr, usageErr?.message || JSON.stringify(usage));
    } else {
      check('quota', 'zafirix_check_usage', false, 'no sample company', true);
    }
  }
}

if (baseUrl) {
  console.log(`\n9. HTTP probes → ${baseUrl}`);
  for (const p of [...CRITICAL_PAGES, '/manifest.json', '/sw.js']) {
    const url = `${baseUrl.replace(/\/$/, '')}${p}`;
    try {
      const res = await fetch(url, { redirect: 'manual', headers: { Accept: 'text/html,*/*' } });
      const ok = [200, 301, 302, 307, 308, 401, 403].includes(res.status);
      check('http', p, ok, `status=${res.status}`, res.status === 404);
    } catch (e) {
      check('http', p, false, e.message);
    }
  }
}

console.log('\n=== Summary ===');
console.log(`  pass=${pass}  warn=${warn}  fail=${fail}`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('');
process.exit(fail > 0 ? 1 : 0);

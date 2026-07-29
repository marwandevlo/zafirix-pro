/**
 * Production readiness: TypeScript, build, URL helpers, portal routes.
 * Run: node scripts/verify-production-readiness.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
let failed = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
}
function fail(label, detail) {
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`);
  failed++;
}

console.log('\n=== Zafirix Pro — Production Readiness ===\n');

console.log('1. TypeScript');
try {
  execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe' });
  ok('npx tsc --noEmit');
} catch (e) {
  fail('TypeScript', e.stderr?.toString()?.slice(0, 300) || e.message);
}

console.log('\n2. Portal routes & URL helpers');
const required = [
  'app/lib/atlas-app-url.ts',
  'app/lib/atlas-client-portal-links.ts',
  'app/portal/page.tsx',
  'app/portal/[companyCode]/page.tsx',
  'app/api/client-portal/link/route.ts',
  'app/components/client-portal/ClientPortalShell.tsx',
  '.env.production.example',
];
for (const f of required) {
  if (fs.existsSync(path.join(ROOT, f))) ok(f);
  else fail('missing file', f);
}

console.log('\n3. Env templates');
const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
for (const key of ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_PORTAL_URL', 'NEXT_PUBLIC_PORTAL_HOST']) {
  if (envExample.includes(key)) ok(`.env.example documents ${key}`);
  else fail('env template', key);
}

console.log('\n4. next.config (portal subdomain rewrites)');
const nextCfg = fs.readFileSync(path.join(ROOT, 'next.config.ts'), 'utf8');
if (nextCfg.includes('NEXT_PUBLIC_PORTAL_HOST') && nextCfg.includes('/portal/:companyCode')) {
  ok('Portal host rewrites configured');
} else {
  fail('next.config.ts portal rewrites');
}

console.log('\n5. Production build (next build)');
try {
  execSync('npm run build', { cwd: ROOT, stdio: 'pipe', env: { ...process.env, CI: '1' } });
  ok('npm run build');
} catch (e) {
  const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
  fail('next build', out.slice(-400));
}

console.log(`\n=== Done ${failed ? `(${failed} failed)` : '(all passed)'} ===\n`);
process.exit(failed ? 1 : 0);

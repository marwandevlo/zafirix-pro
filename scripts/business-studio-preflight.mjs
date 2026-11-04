/**
 * Business Studio release preflight. Read-only: it never contacts Supabase, never deploys and never writes data.
 *
 *   node scripts/business-studio-preflight.mjs                 local gates on the checked-out commit
 *   node scripts/business-studio-preflight.mjs --skip-tests    containment checks only
 *   node scripts/business-studio-preflight.mjs --post-deploy https://host
 *                                                              unauthenticated GET probes after a deployment
 */
import { execFileSync, spawnSync } from 'node:child_process';

const BASELINE = '4fe5012';
const ALLOWED = [
  /^app\/etude-projet\//,
  /^app\/lib\/business-studio\//,
  /^app\/api\/business-studio\//,
  /^tests\/business-studio\//,
  /^public\/fonts\/amiri\//,
  /^docs\/business-studio\//,
  /^scripts\/business-studio-preflight\.mjs$/,
  // Company "clear data" keeps project studies (detached from the company) instead of deleting them.
  /^app\/lib\/atlas-company-clear-server\.ts$/,
  /^app\/companies\/page\.tsx$/,
];

const args = process.argv.slice(2);
const failures = [];
const report = (ok, name, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

async function postDeploy(base) {
  const probe = async (path, accept) => {
    const res = await fetch(new URL(path, base), { redirect: 'manual' });
    report(accept.includes(res.status), `GET ${path}`, `status ${res.status}, expected ${accept.join('/')}`);
  };
  await probe('/api/business-studio/studies', [401]);
  await probe('/etude-projet', [200, 307, 308]);
  await probe('/etude-projet/assistant', [200, 307, 308]);
  await probe('/etude-projet/00000000-0000-0000-0000-000000000000', [200, 307, 308]);
}

if (args[0] === '--post-deploy') {
  if (!args[1]) throw new Error('usage: --post-deploy <baseUrl>');
  await postDeploy(args[1]);
} else {
  report(spawnSync('git', ['merge-base', '--is-ancestor', BASELINE, 'HEAD']).status === 0, `HEAD descends from production baseline ${BASELINE}`);
  report(git('status', '--porcelain') === '', 'working tree is clean');

  const changed = git('diff', '--name-only', `${BASELINE}..HEAD`).split('\n').filter(Boolean);
  const outside = changed.filter((f) => !ALLOWED.some((re) => re.test(f)));
  report(outside.length === 0, 'every change since the baseline stays inside the Business Studio paths', outside.join(', '));
  report(!changed.some((f) => f.startsWith('supabase/')), 'no database migration');

  const deleted = git('diff', '--name-only', '--diff-filter=D', `${BASELINE}..HEAD`).split('\n').filter(Boolean);
  report(deleted.length === 0, 'no file deleted since the baseline', deleted.join(', '));

  if (!args.includes('--skip-tests')) {
    const run = (name, cmd) => report(spawnSync(cmd, { shell: true, stdio: 'inherit' }).status === 0, name);
    run('typecheck', 'npx tsc --noEmit -p tsconfig.json');
    run('lint (Business Studio paths)', 'npx eslint app/etude-projet app/lib/business-studio app/api/business-studio tests/business-studio');
    run('unit, financial, tax, report and UI tests', 'npx --yes tsx --test tests/business-studio/*.test.ts');
    run('integration tests (local Postgres/PostgREST)', 'npx --yes tsx --test tests/business-studio/integration/store.integration.test.ts');
  }
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exitCode = failures.length ? 1 : 0;

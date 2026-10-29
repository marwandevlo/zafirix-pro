/**
 * Preview isolation guard in next.config.ts: a Vercel Preview build must never use the production database.
 * Each case loads next.config.ts in a child process with a synthetic environment (no real keys).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROD_REF = 'kwylivmhlcuflubyubdv';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const OTHER_URL = 'https://previewisolated000000.supabase.co';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (ref) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref, role: 'anon' })}.c2ln`;

function loadConfig(extraEnv) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    USERPROFILE: process.env.USERPROFILE,
    HOME: process.env.HOME,
    ...extraEnv,
  };
  const res = spawnSync('npx', ['--yes', 'tsx', 'tests/preview-guard/load-config.mts'], {
    cwd: ROOT, env, encoding: 'utf8', shell: true, timeout: 120_000,
  });
  return { ok: res.status === 0, output: `${res.stdout}\n${res.stderr}` };
}

describe('Preview builds refuse the production database', () => {
  it('a local build (no VERCEL_ENV) is unaffected', () => {
    const r = loadConfig({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL });
    assert.ok(r.ok, r.output);
  });

  it('a production build is unaffected', () => {
    const r = loadConfig({ VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: PROD_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt(PROD_REF) });
    assert.ok(r.ok, r.output);
  });

  it('a Preview build with the production URL fails and names only the variable', () => {
    const r = loadConfig({ VERCEL_ENV: 'preview', ATLAS_PREVIEW_ISOLATED_DB: '1', NEXT_PUBLIC_SUPABASE_URL: PROD_URL });
    assert.equal(r.ok, false);
    assert.match(r.output, /preview-guard/);
    assert.match(r.output, /NEXT_PUBLIC_SUPABASE_URL/);
    assert.ok(!r.output.includes(PROD_URL), 'the variable value must not be printed');
  });

  it('a Preview build with a production key fails even when the URL is a custom domain', () => {
    const key = fakeJwt(PROD_REF);
    const r = loadConfig({
      VERCEL_ENV: 'preview', ATLAS_PREVIEW_ISOLATED_DB: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: key,
    });
    assert.equal(r.ok, false);
    assert.match(r.output, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.ok(!r.output.includes(key), 'the key must not be printed');
  });

  it('a Preview build fails closed without the isolation marker', () => {
    const r = loadConfig({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: OTHER_URL });
    assert.equal(r.ok, false);
    assert.match(r.output, /ATLAS_PREVIEW_ISOLATED_DB=1 is not set/);
  });

  it('a Preview build on an isolated project with the marker succeeds', () => {
    const r = loadConfig({
      VERCEL_ENV: 'preview', ATLAS_PREVIEW_ISOLATED_DB: '1',
      NEXT_PUBLIC_SUPABASE_URL: OTHER_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt('previewisolated000000'),
    });
    assert.ok(r.ok, r.output);
  });
});

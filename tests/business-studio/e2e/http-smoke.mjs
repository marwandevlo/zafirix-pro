/**
 * HTTP smoke test against `next start` + serve-stack.mjs (through middleware and API routes).
 * Usage: node tests/business-studio/e2e/http-smoke.mjs <outDir> <baseUrl>
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, base] = process.argv.slice(2);
const info = JSON.parse(readFileSync(join(outDir, 'session.json'), 'utf8'));
const cookieFor = (session) => `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
const otherSession = { ...info.session, access_token: info.otherUserToken, user: { ...info.session.user, id: 'other' } };

async function call(path, { method = 'GET', body, session = info.session, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) {
    headers.cookie = cookieFor(session);
    headers.authorization = `Bearer ${session.access_token}`;
  }
  const res = await fetch(`${base}/api/business-studio${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const results = [];
const check = async (name, fn) => {
  await fn();
  results.push(name);
  console.log(`ok - ${name}`);
};

await check('unauthenticated request is rejected', async () => {
  const r = await call('/studies', { auth: false });
  assert.equal(r.status, 401);
});

let created;
await check('list shows the seeded legacy study', async () => {
  const r = await call('/studies');
  assert.equal(r.status, 200);
  assert.ok(r.body.studies.some((s) => s.id === info.legacyId && s.kind === 'legacy'));
});

await check('create a study linked to the user company', async () => {
  const r = await call('/studies', { method: 'POST', body: { name: 'HTTP smoke', companyId: info.companyId, template: 'hospitality', years: 3 } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  created = r.body.study;
  assert.equal(created.meta.revision, 1);
});

await check('another tenant cannot read, save or list the study', async () => {
  assert.equal((await call(`/studies/${created.id}`, { session: otherSession })).status, 404);
  assert.equal((await call(`/studies/${created.id}`, { method: 'PUT', session: otherSession, body: { name: 'x', revision: 1 } })).status, 404);
  const list = await call('/studies', { session: otherSession });
  assert.ok(!list.body.studies.some((s) => s.id === created.id || s.id === info.legacyId));
});

await check('another tenant cannot create a study in this company', async () => {
  const r = await call('/studies', { method: 'POST', session: otherSession, body: { name: 'intrusion', companyId: info.companyId } });
  assert.equal(r.status, 403);
});

await check('server rejects an invalid model with 422 and issues', async () => {
  const bad = structuredClone(created.meta.model);
  bad.horizon.years = 99;
  const r = await call(`/studies/${created.id}`, { method: 'PUT', body: { model: bad, revision: 1 } });
  assert.equal(r.status, 422);
  assert.ok(Array.isArray(r.body.issues) && r.body.issues.length > 0);
});

await check('stale revision is refused with 409', async () => {
  const ok = await call(`/studies/${created.id}`, { method: 'PUT', body: { name: 'HTTP smoke v2', revision: 1 } });
  assert.equal(ok.status, 200);
  const stale = await call(`/studies/${created.id}`, { method: 'PUT', body: { name: 'stale', revision: 1 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'revision_conflict');
});

await check('actuals read only this company entries', async () => {
  const r = await call(`/studies/${created.id}/actuals`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const total = r.body.actuals.series.revenue.reduce((a, b) => a + b, 0);
  assert.ok(total < 99999900, 'other tenant revenue must not leak');
});

console.log(`\n${results.length} checks passed`);

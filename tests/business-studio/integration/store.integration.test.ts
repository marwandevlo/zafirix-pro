/**
 * Business Studio store against a local Postgres + PostgREST built from this branch's migrations.
 * Run: npx tsx --test tests/business-studio/integration/store.integration.test.ts
 * Skips when the local tools are not installed. Not equivalent to hosted Supabase verification.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { detachCompanyStudies } from '../../../app/lib/business-studio/company-clear';
import {
  changeStatus, createStudy, createVersion, duplicateStudy, getStudy, getVersion, importLegacy, listStudies, listVersions, readActualLines,
  restoreVersion, saveStudy, setSharing, StoreError,
} from '../../../app/lib/business-studio/server-store';
import { richModel } from '../fixtures';
import { ANON_KEY, SERVICE_KEY, createUser, startDatabase, startGateway, startPostgrest, toolsAvailable, userToken } from './stack.mjs';

const enabled = toolsAvailable();
type Stack = { db: Awaited<ReturnType<typeof startDatabase>>; pgrst: { stop: () => void }; gw: { url: string; close: () => Promise<void> } };
let stack: Stack | null = null;
let admin: SupabaseClient;
const A = randomUUID();
const B = randomUUID();
const C = randomUUID();
const D = randomUUID();
const E = randomUUID();
const companyA = randomUUID();
const companyB = randomUUID();

async function expectError(p: Promise<unknown>, status: number, code?: string) {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof StoreError, `expected StoreError, got ${String(e)}`);
    assert.equal(e.status, status, `status for ${e.code}`);
    if (code) assert.equal(e.code, code);
    return e;
  }
  assert.fail(`expected ${status}${code ? ` ${code}` : ''}`);
}

before(async () => {
  if (!enabled) return;
  const db = await startDatabase({ port: 55532 });
  assert.deepEqual(db.failures, [], 'all migrations applied');
  const pgrst = await startPostgrest({ dbPort: 55532, port: 55533 });
  const gw = await startGateway({ admin: db.admin, postgrestPort: 55533, port: 55521 });
  stack = { db, pgrst, gw };
  for (const u of [A, B, C, D, E]) await createUser(db.admin, u);
  const ws = randomUUID();
  await db.admin.query('insert into public.atlas_workspaces (id, owner_user_id, name) values ($1, $2, $3)', [ws, A, 'WS A']);
  await db.admin.query('insert into public.atlas_companies (id, user_id, company_json, workspace_id) values ($1, $2, $3, $4)', [companyA, A, '{"name":"A"}', ws]);
  await db.admin.query('insert into public.atlas_companies (id, user_id, company_json) values ($1, $2, $3)', [companyB, B, '{"name":"B"}']);
  const { rows } = await db.admin.query("select slug from public.atlas_roles where slug in ('viewer', 'accountant', 'auditor') order by slug");
  assert.deepEqual(rows.map((r: { slug: string }) => r.slug), ['accountant', 'auditor', 'viewer']);
  const role = 'insert into public.atlas_user_roles (user_id, workspace_id, company_id, role_slug) values ($1, $2, $3, $4)';
  await db.admin.query(role, [C, ws, companyA, 'viewer']);
  await db.admin.query(role, [D, ws, companyA, 'accountant']);
  await db.admin.query(role, [E, ws, companyA, 'auditor']);
  admin = createClient(gw.url, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
});

after(async () => {
  if (!stack) return;
  await stack.gw.close();
  stack.pgrst.stop();
  await stack.db.stop();
});

test('ownership, company access and cross-tenant isolation', { skip: !enabled }, async () => {
  const s = await createStudy(admin, A, { name: 'Étude A', companyId: companyA, model: richModel(5) });
  assert.equal(s.meta.revision, 1);
  assert.equal(s.meta.lastComputed?.checksOk, true);
  assert.equal((await getStudy(admin, A, s.id)).name, 'Étude A');
  assert.ok((await listStudies(admin, A)).some((x) => x.id === s.id && x.kind === 'v2' && x.years === 5));

  // Another tenant sees nothing and can change nothing.
  await expectError(getStudy(admin, B, s.id), 404);
  await expectError(saveStudy(admin, B, s.id, { model: richModel(3), revision: 1 }), 404);
  await expectError(changeStatus(admin, B, s.id, { action: 'archive', revision: 1 }), 404);
  await expectError(duplicateStudy(admin, B, s.id, {}), 404);
  await expectError(createVersion(admin, B, s.id, {}), 404);
  await expectError(listVersions(admin, B, s.id), 404);
  await expectError(readActualLines(admin, B, s.id), 404);
  assert.ok(!(await listStudies(admin, B)).some((x) => x.id === s.id));
  await expectError(createStudy(admin, B, { companyId: companyA, template: 'retail' }), 403, 'company_forbidden');
  await expectError(listStudies(admin, B, { companyId: companyA }), 403);

  // A company member may create studies for the company but cannot open another member's study.
  const c = await createStudy(admin, C, { companyId: companyA, template: 'services' });
  await expectError(getStudy(admin, C, s.id), 404);
  await expectError(getStudy(admin, A, c.id), 404);

  // Unincorporated project: no company at all.
  const solo = await createStudy(admin, B, { template: 'startup' });
  assert.equal(solo.companyId, null);
  await expectError(getStudy(admin, A, solo.id), 404);

  // Database row-level security still applies to direct PostgREST access with a user token.
  const asB = createClient(stack!.gw.url, ANON_KEY, { global: { headers: { Authorization: `Bearer ${userToken(B)}` } }, auth: { persistSession: false } });
  const { data } = await asB.from('atlas_projects').select('id').eq('id', s.id);
  assert.deepEqual(data, []);
});

test('input validation on the server', { skip: !enabled }, async () => {
  const bad = richModel(5) as unknown as Record<string, unknown>;
  (bad.horizon as Record<string, unknown>).years = 99;
  await expectError(createStudy(admin, A, { companyId: companyA, model: bad }), 422, 'invalid_model');
  await expectError(getStudy(admin, A, 'not-a-uuid'), 400, 'invalid_id');
  await expectError(createStudy(admin, A, { companyId: 'x' }), 400, 'invalid_company_id');
  const s = await createStudy(admin, A, { companyId: companyA, template: 'retail' });
  await expectError(saveStudy(admin, A, s.id, { model: richModel(2) }), 400, 'revision_required');
});

test('optimistic concurrency: exactly one of two concurrent saves wins', { skip: !enabled }, async () => {
  const s = await createStudy(admin, A, { companyId: companyA, model: richModel(3) });
  const m1 = richModel(3); m1.general.inflationPct = 1;
  const m2 = richModel(3); m2.general.inflationPct = 4;
  const results = await Promise.allSettled([
    saveStudy(admin, A, s.id, { model: m1, revision: 1 }),
    saveStudy(admin, A, s.id, { model: m2, revision: 1 }),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  const ko = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  assert.equal(ok.length, 1);
  assert.equal(ko.length, 1);
  assert.equal((ko[0].reason as StoreError).status, 409);
  const cur = await getStudy(admin, A, s.id);
  assert.equal(cur.meta.revision, 2);
  await expectError(saveStudy(admin, A, s.id, { model: m1, revision: 1 }), 409, 'revision_conflict');
  assert.ok(cur.meta.audit.some((e) => e.action === 'saved' && e.revision === 2));
});

test('status workflow, locking, archive and restore', { skip: !enabled }, async () => {
  const s = await createStudy(admin, A, { companyId: companyA, model: richModel(5) });
  await expectError(changeStatus(admin, A, s.id, { action: 'approve', revision: 1 }), 409, 'invalid_transition');
  let cur = await changeStatus(admin, A, s.id, { action: 'submit', revision: 1 });
  assert.equal(cur.meta.studyStatus, 'under_review');
  cur = await changeStatus(admin, A, s.id, { action: 'approve', revision: cur.meta.revision });
  assert.equal(cur.meta.studyStatus, 'approved');
  await expectError(saveStudy(admin, A, s.id, { model: richModel(5), revision: cur.meta.revision }), 409, 'study_locked');
  cur = await changeStatus(admin, A, s.id, { action: 'archive', revision: cur.meta.revision });
  assert.equal(cur.meta.studyStatus, 'archived');
  assert.ok(!(await listStudies(admin, A)).some((x) => x.id === s.id));
  assert.ok((await listStudies(admin, A, { includeArchived: true })).some((x) => x.id === s.id));
  cur = await changeStatus(admin, A, s.id, { action: 'restore', revision: cur.meta.revision });
  assert.equal(cur.meta.studyStatus, 'approved');
  cur = await changeStatus(admin, A, s.id, { action: 'reopen', revision: cur.meta.revision });
  assert.equal(cur.meta.studyStatus, 'draft');
  await expectError(changeStatus(admin, A, s.id, { action: 'delete', revision: cur.meta.revision }), 400, 'invalid_action');
});

test('duplicate and versions', { skip: !enabled }, async () => {
  const s = await createStudy(admin, A, { companyId: companyA, model: richModel(5) });
  const d = await duplicateStudy(admin, A, s.id, {});
  assert.notEqual(d.id, s.id);
  assert.match(d.name, /^Copie de/);
  assert.deepEqual(d.meta.model, s.meta.model);
  const v = await createVersion(admin, A, s.id, { label: 'Dossier banque' });
  assert.equal(v.checksOk, true);
  const after1 = await getStudy(admin, A, s.id);
  assert.equal(after1.meta.revision, 1, 'snapshot does not invalidate an open editor');
  const changed = richModel(7);
  const saved = await saveStudy(admin, A, s.id, { model: changed, revision: 1 });
  assert.equal(saved.meta.model.horizon.years, 7);
  const list = await listVersions(admin, A, s.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'Dossier banque');
  const restored = await restoreVersion(admin, A, s.id, v.id, { revision: saved.meta.revision });
  assert.equal(restored.meta.model.horizon.years, 5);
  await expectError(restoreVersion(admin, B, s.id, v.id, { revision: restored.meta.revision }), 404);
  // A version id cannot be used as a study id.
  await expectError(getStudy(admin, A, v.id), 404);
  assert.ok(!(await listStudies(admin, A, { includeArchived: true })).some((x) => x.id === v.id));
});

test('legacy studies stay intact and are importable', { skip: !enabled }, async () => {
  const legacyId = randomUUID();
  const meta = { kind: 'etude_faisabilite', step: 22, etudeReady: true, etudeText: 'x', messages: [], financials: {}, wizardData: { nom_projet: 'Ancien', secteur: 'Commerce', capital: '50000', ca_prevu: '20000', cin: 'ZZ999' } };
  await stack!.db.admin.query('insert into public.atlas_projects (id, user_id, company_id, name, status, metadata) values ($1, $2, $3, $4, $5, $6)', [legacyId, A, companyA, 'Ancien', 'completed', meta]);
  const before = await stack!.db.admin.query('select metadata, updated_at, status, name from public.atlas_projects where id = $1', [legacyId]);
  assert.ok((await listStudies(admin, A)).some((x) => x.id === legacyId && x.kind === 'legacy'));
  const { study, notes } = await importLegacy(admin, A, legacyId);
  assert.equal(study.meta.importedFrom, legacyId);
  assert.ok(notes.length > 0);
  assert.ok(!JSON.stringify(study.meta.model).includes('ZZ999'));
  const afterRow = await stack!.db.admin.query('select metadata, updated_at, status, name from public.atlas_projects where id = $1', [legacyId]);
  assert.deepEqual(afterRow.rows[0], before.rows[0], 'legacy row unchanged');
  await expectError(importLegacy(admin, B, legacyId), 404);
});

test('actuals are read-only and company-scoped', { skip: !enabled }, async () => {
  const q = stack!.db.admin;
  const ins = 'insert into public.atlas_accounting_entries (user_id, company_id, entry_json, entry_date, validation_status) values ($1, $2, $3, $4, $5)';
  await q.query(ins, [A, companyA, { compte: '7111', debit: 0, credit: 1000, date: '2026-02-10' }, '2026-02-10', 'validated']);
  await q.query(ins, [A, companyA, { compte: '6111', debit: 300, credit: 0, date: '2026-02-11' }, '2026-02-11', 'draft']);
  await q.query(ins, [B, companyB, { compte: '7111', debit: 0, credit: 999999, date: '2026-02-10' }, '2026-02-10', 'validated']);
  await q.query(ins, [A, companyA, { compte: '7111', debit: 0, credit: 5, date: '2020-01-01' }, '2020-01-01', 'validated']);
  const snapshot = async () => (await q.query('select id, entry_json, updated_at, validation_status from public.atlas_accounting_entries order by id')).rows;
  const beforeRows = await snapshot();
  const s = await createStudy(admin, A, { companyId: companyA, model: richModel(2, '2026-01') });
  const r1 = await readActualLines(admin, A, s.id);
  assert.equal(r1.lines.length, 1);
  assert.equal(r1.lines[0].credit, 1000);
  const r2 = await readActualLines(admin, A, s.id, { includeUnvalidated: true });
  assert.equal(r2.lines.length, 2);
  // A company member reads the company's actuals through their own study.
  const c = await createStudy(admin, C, { companyId: companyA, model: richModel(2, '2026-01') });
  assert.equal((await readActualLines(admin, C, c.id)).lines.length, 1);
  const solo = await createStudy(admin, A, { model: richModel(2, '2026-01') });
  await expectError(readActualLines(admin, A, solo.id), 409, 'study_without_company');
  assert.deepEqual(await snapshot(), beforeRows, 'accounting rows untouched');
});

test('sharing with company members, edit and approval roles, independent approval', { skip: !enabled }, async () => {
  const s = await createStudy(admin, A, { name: 'Partagée', companyId: companyA, model: richModel(5) });
  assert.equal(s.meta.sharing, 'private');
  await expectError(getStudy(admin, C, s.id), 404);

  // Read-only sharing: every company member reads, nobody but the owner writes.
  let cur = await setSharing(admin, A, s.id, { sharing: 'company_read', revision: 1 });
  assert.equal(cur.meta.sharing, 'company_read');
  const asViewer = await getStudy(admin, C, s.id);
  assert.equal(asViewer.access.level, 'read');
  assert.equal(asViewer.access.canApprove, false);
  assert.equal((await getStudy(admin, D, s.id)).access.level, 'read');
  await expectError(saveStudy(admin, D, s.id, { model: richModel(5), revision: cur.meta.revision }), 403, 'read_only');
  await expectError(setSharing(admin, C, s.id, { sharing: 'company_edit', revision: cur.meta.revision }), 403, 'owner_only');
  await expectError(getStudy(admin, B, s.id), 404);
  const listed = (await listStudies(admin, C)).find((x) => x.id === s.id);
  assert.equal(listed?.access, 'read');
  assert.ok(!(await listStudies(admin, B)).some((x) => x.id === s.id));
  await expectError(setSharing(admin, A, s.id, { sharing: 'public', revision: cur.meta.revision }), 400, 'invalid_sharing');

  // Editable sharing: accountants and above edit, viewers still read only.
  cur = await setSharing(admin, A, s.id, { sharing: 'company_edit', revision: cur.meta.revision });
  const asAccountant = await getStudy(admin, D, s.id);
  assert.equal(asAccountant.access.level, 'edit');
  const m = richModel(5); m.general.inflationPct = 3;
  cur = await saveStudy(admin, D, s.id, { model: m, revision: cur.meta.revision });
  assert.equal(cur.meta.model.general.inflationPct, 3);
  assert.equal(cur.meta.audit.at(-1)?.userId, D);
  assert.equal((await getStudy(admin, A, s.id)).meta.revision, cur.meta.revision, 'owner sees the member edit');
  await expectError(saveStudy(admin, C, s.id, { model: m, revision: cur.meta.revision }), 403, 'read_only');
  await expectError(changeStatus(admin, D, s.id, { action: 'archive', revision: cur.meta.revision }), 403, 'owner_only');

  // Versions: editors create, readers list and open.
  const v = await createVersion(admin, D, s.id, { label: 'Avant revue' });
  await expectError(createVersion(admin, C, s.id, {}), 403, 'read_only');
  assert.ok((await listVersions(admin, C, s.id)).some((x) => x.id === v.id));
  assert.equal((await getVersion(admin, C, s.id, v.id)).summary.label, 'Avant revue');
  cur = await getStudy(admin, A, s.id);

  // Approval: not by the submitter, not by a viewer; an auditor's approval is independent.
  cur = await changeStatus(admin, D, s.id, { action: 'submit', revision: cur.meta.revision });
  assert.equal(cur.meta.submittedBy, D);
  await expectError(changeStatus(admin, D, s.id, { action: 'approve', revision: cur.meta.revision }), 403, 'approver_must_differ');
  await expectError(changeStatus(admin, C, s.id, { action: 'approve', revision: cur.meta.revision }), 403, 'approval_forbidden');
  cur = await changeStatus(admin, E, s.id, { action: 'approve', revision: cur.meta.revision });
  assert.equal(cur.meta.studyStatus, 'approved');
  assert.deepEqual({ by: cur.meta.approval?.by, independent: cur.meta.approval?.independent, role: cur.meta.approval?.role }, { by: E, independent: true, role: 'auditor' });
  assert.equal((await listStudies(admin, A)).find((x) => x.id === s.id)?.selfApproved, false);

  // The owner's own approval is recorded as a self-approval.
  cur = await changeStatus(admin, A, s.id, { action: 'reopen', revision: cur.meta.revision });
  assert.equal(cur.meta.approval, null);
  cur = await changeStatus(admin, A, s.id, { action: 'submit', revision: cur.meta.revision });
  cur = await changeStatus(admin, A, s.id, { action: 'approve', revision: cur.meta.revision });
  assert.equal(cur.meta.approval?.independent, false);
  assert.ok(cur.meta.audit.at(-1)?.detail?.includes('self-approval'));
  assert.equal((await listStudies(admin, A)).find((x) => x.id === s.id)?.selfApproved, true);

  // Sharing needs a company; database row-level security is unchanged (owner only).
  const solo = await createStudy(admin, A, { template: 'startup' });
  await expectError(setSharing(admin, A, solo.id, { sharing: 'company_read', revision: 1 }), 409, 'study_without_company');
  const asC = createClient(stack!.gw.url, ANON_KEY, { global: { headers: { Authorization: `Bearer ${userToken(C)}` } }, auth: { persistSession: false } });
  const { data } = await asC.from('atlas_projects').select('id').eq('id', s.id);
  assert.deepEqual(data, []);
});

test('clearing company data keeps studies, versions and legacy studies (detached)', { skip: !enabled }, async () => {
  const q = stack!.db.admin;
  const s = await createStudy(admin, A, { name: 'À conserver', companyId: companyA, model: richModel(3) });
  const v = await createVersion(admin, A, s.id, { label: 'v1' });
  const legacyId = randomUUID();
  await q.query('insert into public.atlas_projects (id, user_id, company_id, name, status, metadata) values ($1, $2, $3, $4, $5, $6)', [legacyId, A, companyA, 'Ancienne', 'completed', { kind: 'etude_faisabilite', wizardData: {} }]);
  const otherId = randomUUID();
  await q.query('insert into public.atlas_projects (id, user_id, company_id, name, status, metadata) values ($1, $2, $3, $4, $5, $6)', [otherId, A, companyA, 'Chantier', 'active', { kind: 'other' }]);
  const memberStudy = await createStudy(admin, D, { name: 'Étude membre', companyId: companyA, model: richModel(3) });

  // Same order and client rights as the clear routine: the owner's own session under row-level security.
  const asA = createClient(stack!.gw.url, ANON_KEY, { global: { headers: { Authorization: `Bearer ${userToken(A)}` } }, auth: { persistSession: false } });
  const detached = await detachCompanyStudies(asA, companyA, A);
  assert.ok(detached.ok);
  const { error } = await asA.from('atlas_projects').delete().eq('company_id', companyA).eq('user_id', A);
  assert.equal(error, null);

  const left = await q.query('select id, company_id from public.atlas_projects where id = any($1)', [[s.id, v.id, legacyId, otherId, memberStudy.id]]);
  const byId = new Map(left.rows.map((r: { id: string; company_id: string | null }) => [r.id, r.company_id]));
  assert.ok(!byId.has(otherId), 'non-study project deleted');
  for (const id of [s.id, v.id, legacyId]) {
    assert.ok(byId.has(id), `${id} kept`);
    assert.equal(byId.get(id), null, `${id} detached`);
  }
  assert.equal(byId.get(memberStudy.id), companyA, 'another member’s study is not touched');
  const kept = await getStudy(admin, A, s.id);
  assert.equal(kept.companyId, null);
  assert.equal(kept.meta.model.horizon.years, 3);
  assert.ok((await listVersions(admin, A, s.id)).some((x) => x.id === v.id));
});

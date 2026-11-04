/**
 * Server-side persistence for Business Studio, on the existing `atlas_projects` table (no migration):
 *   metadata.kind = 'business_study_v2'       one row per study (model + revision + audit trail)
 *   metadata.kind = 'business_study_version'  immutable snapshots of a study
 *   metadata.kind = 'etude_faisabilite'       legacy studies, read for import only, never modified
 *
 * Every query is scoped to the caller's user id; a study linked to a company also requires current access
 * to that company. Forecasts never touch accounting tables except the read-only select used for actuals.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessCompany } from '@/app/lib/atlas-permissions';
import { isPostgresUuid } from '@/app/lib/atlas-id-validation';
import { ACTUAL_STATUSES_DEFAULT, ACTUAL_STATUSES_WITH_UNVALIDATED, type ActualLine } from './actuals';
import { computeStudy, ENGINE_VERSION } from './engine';
import { importLegacyStudy, isLegacyStudy } from './legacy-import';
import { computeMetrics } from './metrics';
import {
  LEGACY_STUDY_KIND, STUDY_KIND, STUDY_SCHEMA_VERSION, STUDY_VERSION_KIND, type StudyModel, type StudyStatus, validateStudyModel,
  type ValidationIssue,
} from './model';
import { modelFromTemplate } from './sectors';
import { TAX_RULES_VERSION } from './tax-rules';

const TABLE = 'atlas_projects';
const AUDIT_LIMIT = 200;
const VERSION_LIMIT = 100;

export type AuditEvent = { at: string; userId: string; action: string; revision: number; detail?: string };
export type ComputeStamp = { at: string; revision: number; engineVersion: string; rulesVersion: string; checksOk: boolean };

export type StudyMeta = {
  kind: typeof STUDY_KIND;
  schemaVersion: typeof STUDY_SCHEMA_VERSION;
  revision: number;
  studyStatus: StudyStatus;
  statusBeforeArchive: StudyStatus | null;
  model: StudyModel;
  audit: AuditEvent[];
  lastComputed: ComputeStamp | null;
  importedFrom: string | null;
};

export type StudyRecord = { id: string; companyId: string | null; name: string; createdAt: string; updatedAt: string; meta: StudyMeta; issues: ValidationIssue[] };

export type StudySummary = {
  id: string; companyId: string | null; name: string; kind: 'v2' | 'legacy'; status: string; revision: number | null;
  sector: string | null; years: number | null; startMonth: string | null; createdAt: string; updatedAt: string;
};

export type VersionSummary = { id: string; label: string; revision: number; createdAt: string; createdBy: string; engineVersion: string; rulesVersion: string; checksOk: boolean; revenue: number; netIncome: number };

export class StoreError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 413 | 422 | 500, public code: string, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

type Db = SupabaseClient;

async function assertCompany(db: Db, userId: string, companyId: string | null): Promise<void> {
  if (companyId == null) return;
  if (!isPostgresUuid(companyId)) throw new StoreError(400, 'invalid_company_id');
  if (!(await canAccessCompany(db, userId, companyId))) throw new StoreError(403, 'company_forbidden');
}

function nowIso() {
  return new Date().toISOString();
}

function stamp(model: StudyModel, revision: number): ComputeStamp {
  const r = computeStudy(model);
  return { at: nowIso(), revision, engineVersion: ENGINE_VERSION, rulesVersion: TAX_RULES_VERSION, checksOk: r.checks.ok };
}

function pushAudit(meta: StudyMeta, ev: Omit<AuditEvent, 'at'>): AuditEvent[] {
  return [...meta.audit, { at: nowIso(), ...ev }].slice(-AUDIT_LIMIT);
}

function readMeta(raw: unknown): { meta: StudyMeta; issues: ValidationIssue[] } | null {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (m.kind !== STUDY_KIND) return null;
  const v = validateStudyModel(m.model);
  const status = (['draft', 'under_review', 'approved', 'archived'] as const).find((s) => s === m.studyStatus) ?? 'draft';
  const before = (['draft', 'under_review', 'approved'] as const).find((s) => s === m.statusBeforeArchive) ?? null;
  return {
    meta: {
      kind: STUDY_KIND, schemaVersion: STUDY_SCHEMA_VERSION,
      revision: Number.isInteger(m.revision) ? (m.revision as number) : 1,
      studyStatus: status, statusBeforeArchive: before, model: v.model,
      audit: Array.isArray(m.audit) ? (m.audit as AuditEvent[]).slice(-AUDIT_LIMIT) : [],
      lastComputed: (m.lastComputed as ComputeStamp | null) ?? null,
      importedFrom: typeof m.importedFrom === 'string' ? m.importedFrom : null,
    },
    issues: v.issues,
  };
}

function cleanName(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.trim().slice(0, 200) : '';
  return s || fallback;
}

// ─── Queries ─────────────────────────────────────────────────────────────────────────────────────

export async function listStudies(db: Db, userId: string, opts: { companyId?: string | null; includeArchived?: boolean } = {}): Promise<StudySummary[]> {
  if (opts.companyId) await assertCompany(db, userId, opts.companyId);
  let q = db
    .from(TABLE)
    .select('id, company_id, name, status, created_at, updated_at, kind:metadata->>kind, revision:metadata->>revision, study_status:metadata->>studyStatus, sector:metadata->model->>sector, years:metadata->model->horizon->>years, start:metadata->model->horizon->>startMonth, legacy_sector:metadata->wizardData->>secteur')
    .eq('user_id', userId)
    .in('metadata->>kind', [STUDY_KIND, LEGACY_STUDY_KIND])
    .order('updated_at', { ascending: false })
    .limit(500);
  if (opts.companyId) q = q.eq('company_id', opts.companyId);
  const { data, error } = await q;
  if (error) throw new StoreError(500, 'list_failed');
  const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
  const allowed = new Map<string, boolean>();
  const out: StudySummary[] = [];
  for (const r of rows) {
    const companyId = r.company_id ?? null;
    if (companyId) {
      if (!allowed.has(companyId)) allowed.set(companyId, await canAccessCompany(db, userId, companyId));
      if (!allowed.get(companyId)) continue;
    }
    const v2 = r.kind === STUDY_KIND;
    const status = v2 ? (r.study_status ?? 'draft') : 'legacy';
    if (!opts.includeArchived && status === 'archived') continue;
    out.push({
      id: String(r.id), companyId, name: String(r.name ?? ''), kind: v2 ? 'v2' : 'legacy', status,
      revision: v2 ? Number(r.revision ?? 1) : null, sector: v2 ? r.sector ?? null : r.legacy_sector ?? null,
      years: v2 && r.years ? Number(r.years) : null, startMonth: v2 ? r.start ?? null : null,
      createdAt: String(r.created_at), updatedAt: String(r.updated_at),
    });
  }
  return out;
}

async function loadRow(db: Db, userId: string, id: string, kind: string) {
  if (!isPostgresUuid(id)) throw new StoreError(400, 'invalid_id');
  const { data, error } = await db
    .from(TABLE)
    .select('id, company_id, name, metadata, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('metadata->>kind', kind)
    .maybeSingle();
  if (error) throw new StoreError(500, 'load_failed');
  if (!data) throw new StoreError(404, 'not_found');
  const companyId = (data.company_id as string | null) ?? null;
  await assertCompany(db, userId, companyId);
  return { ...data, companyId };
}

export async function getStudy(db: Db, userId: string, id: string): Promise<StudyRecord> {
  const row = await loadRow(db, userId, id, STUDY_KIND);
  const parsed = readMeta(row.metadata);
  if (!parsed) throw new StoreError(404, 'not_found');
  return { id: String(row.id), companyId: row.companyId, name: String(row.name), createdAt: String(row.created_at), updatedAt: String(row.updated_at), meta: parsed.meta, issues: parsed.issues };
}

// ─── Mutations ───────────────────────────────────────────────────────────────────────────────────

function requireValid(input: unknown): StudyModel {
  const v = validateStudyModel(input);
  const errors = v.issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) throw new StoreError(422, 'invalid_model', { issues: errors.slice(0, 50) });
  return v.model;
}

export async function createStudy(
  db: Db, userId: string,
  input: { name?: unknown; companyId?: unknown; model?: unknown; template?: unknown; years?: unknown; startMonth?: unknown; projectType?: unknown; importedFrom?: string | null; auditDetail?: string },
): Promise<StudyRecord> {
  const companyId = typeof input.companyId === 'string' && input.companyId ? input.companyId : null;
  await assertCompany(db, userId, companyId);
  let model: StudyModel;
  if (input.model != null) {
    model = requireValid(input.model);
  } else {
    const sector = typeof input.template === 'string' ? input.template : 'other';
    const base = modelFromTemplate(
      (validateStudyModel({ sector }).model.sector),
      {
        years: typeof input.years === 'number' ? input.years : undefined,
        startMonth: typeof input.startMonth === 'string' ? input.startMonth : undefined,
        projectType: validateStudyModel({ projectType: input.projectType }).model.projectType,
      },
    );
    model = requireValid(base);
  }
  const now = nowIso();
  const meta: StudyMeta = {
    kind: STUDY_KIND, schemaVersion: STUDY_SCHEMA_VERSION, revision: 1, studyStatus: 'draft', statusBeforeArchive: null, model,
    audit: [{ at: now, userId, action: input.importedFrom ? 'imported' : 'created', revision: 1, detail: input.auditDetail }],
    lastComputed: stamp(model, 1), importedFrom: input.importedFrom ?? null,
  };
  const name = cleanName(input.name, model.profile.company.tradingName || model.profile.company.name || 'Nouvelle étude');
  const { data, error } = await db
    .from(TABLE)
    .insert({ user_id: userId, company_id: companyId, name, status: 'draft', metadata: meta })
    .select('id, created_at, updated_at')
    .single();
  if (error || !data) throw new StoreError(500, 'create_failed');
  return { id: String(data.id), companyId, name, createdAt: String(data.created_at), updatedAt: String(data.updated_at), meta, issues: [] };
}

async function conditionalWrite(db: Db, userId: string, id: string, expectedRevision: number, patch: { name?: string; status?: string; metadata: StudyMeta }) {
  const { data, error } = await db
    .from(TABLE)
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('metadata->>kind', STUDY_KIND)
    .eq('metadata->>revision', String(expectedRevision))
    .select('id, updated_at');
  if (error) throw new StoreError(500, 'update_failed');
  if (!data || data.length === 0) {
    const current = await getStudy(db, userId, id);
    throw new StoreError(409, 'revision_conflict', { currentRevision: current.meta.revision });
  }
  return String((data[0] as { updated_at: string }).updated_at);
}

export async function saveStudy(db: Db, userId: string, id: string, input: { name?: unknown; model?: unknown; revision?: unknown }): Promise<StudyRecord> {
  if (!Number.isInteger(input.revision)) throw new StoreError(400, 'revision_required');
  const current = await getStudy(db, userId, id);
  if (current.meta.revision !== input.revision) throw new StoreError(409, 'revision_conflict', { currentRevision: current.meta.revision });
  if (current.meta.studyStatus === 'approved' || current.meta.studyStatus === 'archived') throw new StoreError(409, 'study_locked', { status: current.meta.studyStatus });
  const model = input.model != null ? requireValid(input.model) : current.meta.model;
  const revision = current.meta.revision + 1;
  const name = input.name != null ? cleanName(input.name, current.name) : current.name;
  const meta: StudyMeta = {
    ...current.meta, model, revision, lastComputed: stamp(model, revision),
    audit: pushAudit(current.meta, { userId, action: input.model != null ? 'saved' : 'renamed', revision }),
  };
  const updatedAt = await conditionalWrite(db, userId, id, current.meta.revision, { name, metadata: meta });
  return { ...current, name, updatedAt, meta, issues: validateStudyModel(model).issues };
}

export type StatusAction = 'submit' | 'approve' | 'reopen' | 'archive' | 'restore';
const TRANSITIONS: Record<StatusAction, { from: readonly StudyStatus[]; to: (m: StudyMeta) => StudyStatus }> = {
  submit: { from: ['draft'], to: () => 'under_review' },
  approve: { from: ['under_review'], to: () => 'approved' },
  reopen: { from: ['under_review', 'approved'], to: () => 'draft' },
  archive: { from: ['draft', 'under_review', 'approved'], to: () => 'archived' },
  restore: { from: ['archived'], to: (m) => m.statusBeforeArchive ?? 'draft' },
};

export async function changeStatus(db: Db, userId: string, id: string, input: { action?: unknown; revision?: unknown }): Promise<StudyRecord> {
  const action = input.action as StatusAction;
  const t = TRANSITIONS[action];
  if (!t) throw new StoreError(400, 'invalid_action');
  if (!Number.isInteger(input.revision)) throw new StoreError(400, 'revision_required');
  const current = await getStudy(db, userId, id);
  if (current.meta.revision !== input.revision) throw new StoreError(409, 'revision_conflict', { currentRevision: current.meta.revision });
  if (!t.from.includes(current.meta.studyStatus)) throw new StoreError(409, 'invalid_transition', { status: current.meta.studyStatus });
  if (action === 'approve' && !stamp(current.meta.model, current.meta.revision).checksOk) throw new StoreError(409, 'reconciliation_failed');
  const to = t.to(current.meta);
  const revision = current.meta.revision + 1;
  const meta: StudyMeta = {
    ...current.meta, revision, studyStatus: to,
    statusBeforeArchive: action === 'archive' ? current.meta.studyStatus : action === 'restore' ? null : current.meta.statusBeforeArchive,
    audit: pushAudit(current.meta, { userId, action, revision, detail: `${current.meta.studyStatus} → ${to}` }),
  };
  const updatedAt = await conditionalWrite(db, userId, id, current.meta.revision, { status: to, metadata: meta });
  return { ...current, updatedAt, meta };
}

export async function duplicateStudy(db: Db, userId: string, id: string, input: { name?: unknown }): Promise<StudyRecord> {
  const src = await getStudy(db, userId, id);
  return createStudy(db, userId, {
    name: cleanName(input.name, `Copie de ${src.name}`.slice(0, 200)), companyId: src.companyId, model: src.meta.model,
    auditDetail: `duplicated_from:${src.id}@${src.meta.revision}`,
  });
}

// ─── Versions ────────────────────────────────────────────────────────────────────────────────────

export async function createVersion(db: Db, userId: string, id: string, input: { label?: unknown }): Promise<VersionSummary> {
  const study = await getStudy(db, userId, id);
  const { count } = await db.from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('metadata->>kind', STUDY_VERSION_KIND).eq('metadata->>studyId', id);
  if ((count ?? 0) >= VERSION_LIMIT) throw new StoreError(409, 'version_limit', { limit: VERSION_LIMIT });
  const result = computeStudy(study.meta.model);
  const metrics = computeMetrics(study.meta.model, result);
  const label = cleanName(input.label, `Révision ${study.meta.revision}`);
  const createdAt = nowIso();
  const meta = {
    kind: STUDY_VERSION_KIND, studyId: id, label, revision: study.meta.revision, studyStatus: study.meta.studyStatus, createdBy: userId,
    engineVersion: ENGINE_VERSION, rulesVersion: TAX_RULES_VERSION, checksOk: result.checks.ok,
    revenue: metrics.totals.revenue, netIncome: metrics.totals.netIncome, model: study.meta.model,
  };
  const { data, error } = await db
    .from(TABLE)
    .insert({ user_id: userId, company_id: study.companyId, name: `${study.name} — ${label}`.slice(0, 250), status: 'version', metadata: meta })
    .select('id, created_at')
    .single();
  if (error || !data) throw new StoreError(500, 'version_failed');
  // The audit entry keeps the revision so an open editor does not get a conflict; the version row is the record.
  const updated = { ...study.meta, audit: pushAudit(study.meta, { userId, action: 'version_created', revision: study.meta.revision, detail: String(data.id) }) };
  await conditionalWrite(db, userId, id, study.meta.revision, { metadata: updated }).catch(() => undefined);
  return { id: String(data.id), label, revision: meta.revision, createdAt: String(data.created_at ?? createdAt), createdBy: userId, engineVersion: ENGINE_VERSION, rulesVersion: TAX_RULES_VERSION, checksOk: meta.checksOk, revenue: meta.revenue, netIncome: meta.netIncome };
}

export async function listVersions(db: Db, userId: string, id: string): Promise<VersionSummary[]> {
  await getStudy(db, userId, id);
  const { data, error } = await db
    .from(TABLE)
    .select('id, created_at, label:metadata->>label, revision:metadata->>revision, created_by:metadata->>createdBy, engine:metadata->>engineVersion, rules:metadata->>rulesVersion, checks:metadata->>checksOk, revenue:metadata->>revenue, net:metadata->>netIncome')
    .eq('user_id', userId)
    .eq('metadata->>kind', STUDY_VERSION_KIND)
    .eq('metadata->>studyId', id)
    .order('created_at', { ascending: false })
    .limit(VERSION_LIMIT);
  if (error) throw new StoreError(500, 'list_failed');
  return ((data ?? []) as unknown as Array<Record<string, string>>).map((r) => ({
    id: String(r.id), label: r.label, revision: Number(r.revision), createdAt: r.created_at, createdBy: r.created_by,
    engineVersion: r.engine, rulesVersion: r.rules, checksOk: r.checks === 'true', revenue: Number(r.revenue), netIncome: Number(r.net),
  }));
}

export async function getVersion(db: Db, userId: string, id: string, versionId: string): Promise<{ summary: VersionSummary; model: StudyModel }> {
  await getStudy(db, userId, id);
  const row = await loadRow(db, userId, versionId, STUDY_VERSION_KIND);
  const m = row.metadata as Record<string, unknown>;
  if (m.studyId !== id) throw new StoreError(404, 'not_found');
  return {
    summary: {
      id: String(row.id), label: String(m.label ?? ''), revision: Number(m.revision), createdAt: String(row.created_at), createdBy: String(m.createdBy ?? ''),
      engineVersion: String(m.engineVersion ?? ''), rulesVersion: String(m.rulesVersion ?? ''), checksOk: m.checksOk === true,
      revenue: Number(m.revenue ?? 0), netIncome: Number(m.netIncome ?? 0),
    },
    model: validateStudyModel(m.model).model,
  };
}

export async function restoreVersion(db: Db, userId: string, id: string, versionId: string, input: { revision?: unknown }): Promise<StudyRecord> {
  const v = await getVersion(db, userId, id, versionId);
  const current = await getStudy(db, userId, id);
  if (!Number.isInteger(input.revision) || current.meta.revision !== input.revision) throw new StoreError(409, 'revision_conflict', { currentRevision: current.meta.revision });
  if (current.meta.studyStatus === 'approved' || current.meta.studyStatus === 'archived') throw new StoreError(409, 'study_locked', { status: current.meta.studyStatus });
  const revision = current.meta.revision + 1;
  const meta: StudyMeta = {
    ...current.meta, model: v.model, revision, lastComputed: stamp(v.model, revision),
    audit: pushAudit(current.meta, { userId, action: 'version_restored', revision, detail: `${versionId}@${v.summary.revision}` }),
  };
  const updatedAt = await conditionalWrite(db, userId, id, current.meta.revision, { metadata: meta });
  return { ...current, updatedAt, meta, issues: validateStudyModel(v.model).issues };
}

// ─── Legacy import ───────────────────────────────────────────────────────────────────────────────

export async function importLegacy(db: Db, userId: string, legacyId: string): Promise<{ study: StudyRecord; notes: string[] }> {
  const row = await loadRow(db, userId, legacyId, LEGACY_STUDY_KIND);
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  if (!isLegacyStudy(metadata)) throw new StoreError(404, 'not_found');
  const res = importLegacyStudy({ id: String(row.id), name: String(row.name), metadata, createdAt: String(row.created_at) });
  const study = await createStudy(db, userId, { name: res.name, companyId: row.companyId, model: res.model, importedFrom: String(row.id), auditDetail: `legacy:${row.id}` });
  return { study, notes: res.notes };
}

// ─── Actuals (read-only) ─────────────────────────────────────────────────────────────────────────

export async function readActualLines(db: Db, userId: string, id: string, opts: { includeUnvalidated?: boolean } = {}): Promise<{ lines: ActualLine[]; companyId: string; truncated: boolean }> {
  const study = await getStudy(db, userId, id);
  if (!study.companyId) throw new StoreError(409, 'study_without_company');
  await assertCompany(db, userId, study.companyId);
  const h = study.meta.model.horizon;
  const [y, m] = h.startMonth.split('-').map(Number);
  const endIndex = y * 12 + (m - 1) + h.years * 12 - 1;
  const endY = Math.floor(endIndex / 12);
  const endM = (endIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(endY, endM, 0)).getUTCDate();
  const from = `${h.startMonth}-01`;
  const to = `${endY}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const statuses = opts.includeUnvalidated ? ACTUAL_STATUSES_WITH_UNVALIDATED : ACTUAL_STATUSES_DEFAULT;
  const lines: ActualLine[] = [];
  const page = 1000;
  const max = 50_000;
  for (let offset = 0; offset < max; offset += page) {
    const { data, error } = await db
      .from('atlas_accounting_entries')
      .select('entry_json, entry_date, validation_status')
      .eq('company_id', study.companyId)
      .in('validation_status', [...statuses])
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + page - 1);
    if (error) throw new StoreError(500, 'actuals_failed');
    for (const r of (data ?? []) as Array<{ entry_json: Record<string, unknown> | null; entry_date: string | null; validation_status: string }>) {
      const j = r.entry_json ?? {};
      lines.push({
        date: String(r.entry_date ?? j.date ?? ''), account: String(j.compte ?? j.account ?? ''),
        debit: Number(j.debit) || 0, credit: Number(j.credit) || 0, status: r.validation_status,
      });
    }
    if (!data || data.length < page) return { lines, companyId: study.companyId, truncated: false };
  }
  return { lines, companyId: study.companyId, truncated: true };
}

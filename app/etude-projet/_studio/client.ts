'use client';

import { supabase } from '@/app/lib/supabase';
import type { ActualsByMonth } from '@/app/lib/business-studio/actuals';
import type { StudyModel, ValidationIssue } from '@/app/lib/business-studio/model';
import type { StatusAction, StudyRecord, StudySummary, VersionSummary } from '@/app/lib/business-studio/server-store';

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: Record<string, unknown>) {
    super(code);
  }
  get issues(): ValidationIssue[] {
    return Array.isArray(this.body.issues) ? (this.body.issues as ValidationIssue[]) : [];
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api/business-studio${path}`, { ...init, headers, cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(body.error ?? body.code ?? `http_${res.status}`), body);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const studioApi = {
  list: (opts: { includeArchived?: boolean } = {}) =>
    call<{ studies: StudySummary[] }>(`/studies${opts.includeArchived ? '?includeArchived=1' : ''}`).then((r) => r.studies),
  create: (input: { name: string; companyId?: string | null; template?: string; years?: number; startMonth?: string; projectType?: string; model?: StudyModel }) =>
    call<{ study: StudyRecord }>('/studies', json('POST', input)).then((r) => r.study),
  get: (id: string) => call<{ study: StudyRecord }>(`/studies/${encodeURIComponent(id)}`).then((r) => r.study),
  save: (id: string, input: { model?: StudyModel; name?: string; revision: number }) =>
    call<{ study: StudyRecord }>(`/studies/${encodeURIComponent(id)}`, json('PUT', input)).then((r) => r.study),
  status: (id: string, action: StatusAction, revision: number) =>
    call<{ study: StudyRecord }>(`/studies/${encodeURIComponent(id)}`, json('PATCH', { action, revision })).then((r) => r.study),
  duplicate: (id: string, name?: string) =>
    call<{ study: StudyRecord }>(`/studies/${encodeURIComponent(id)}/duplicate`, json('POST', { name })).then((r) => r.study),
  versions: (id: string) => call<{ versions: VersionSummary[] }>(`/studies/${encodeURIComponent(id)}/versions`).then((r) => r.versions),
  createVersion: (id: string, label: string) =>
    call<{ version: VersionSummary }>(`/studies/${encodeURIComponent(id)}/versions`, json('POST', { label })).then((r) => r.version),
  getVersion: (id: string, versionId: string) =>
    call<{ version: { summary: VersionSummary; model: StudyModel } }>(`/studies/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`).then((r) => r.version),
  restoreVersion: (id: string, versionId: string, revision: number) =>
    call<{ study: StudyRecord }>(`/studies/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`, json('POST', { action: 'restore', revision })).then((r) => r.study),
  actuals: (id: string, includeUnvalidated: boolean) =>
    call<{ actuals: ActualsByMonth; truncated: boolean; includeUnvalidated: boolean }>(`/studies/${encodeURIComponent(id)}/actuals${includeUnvalidated ? '?includeUnvalidated=1' : ''}`),
  importLegacy: (legacyId: string) =>
    call<{ study: StudyRecord; notes: string[] }>(`/legacy/${encodeURIComponent(legacyId)}/import`, json('POST', {})),
};

let fontCache: Promise<{ regular: string; bold: string }> | null = null;

async function fontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('font_unavailable');
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function loadReportFonts(): Promise<{ regular: string; bold: string }> {
  fontCache ??= Promise.all([fontBase64('/fonts/amiri/Amiri-Regular.ttf'), fontBase64('/fonts/amiri/Amiri-Bold.ttf')])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((e) => { fontCache = null; throw e; });
  return fontCache;
}

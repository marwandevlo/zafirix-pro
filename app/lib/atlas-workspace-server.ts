/**
 * Phase 14 — Workspace & cabinet server helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasWorkspace,
  CabinetClientRow,
  ConsolidatedDashboard,
  WorkspaceType,
} from '@/app/types/atlas-workspace';
import { computeCompanyHealth } from '@/app/lib/atlas-company-health-engine';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';

export async function getOrCreateDefaultWorkspace(
  db: SupabaseClient,
  userId: string,
  type: WorkspaceType = 'single_company',
): Promise<AtlasWorkspace> {
  const { data: existing } = await db
    .from('atlas_workspaces')
    .select('*')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return mapWorkspace(existing);
  }

  const { data, error } = await db
    .from('atlas_workspaces')
    .insert({
      owner_user_id: userId,
      name: type === 'accounting_firm' ? 'Cabinet comptable' : 'Mon espace',
      workspace_type: type,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapWorkspace(data);
}

export async function listWorkspaceCompanies(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<Array<{ id: string; name: string; status: string; isActive: boolean }>> {
  const { data } = await db
    .from('atlas_companies')
    .select('id, name, legal_name, trade_name, status, is_active')
    .eq('user_id', userId)
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
    .neq('status', 'archived')
    .order('name');

  return (data ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.trade_name ?? c.legal_name ?? c.name ?? 'Société'),
    status: String(c.status ?? 'active'),
    isActive: !!c.is_active,
  }));
}

export async function buildCabinetPortfolio(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<CabinetClientRow[]> {
  const companies = await listWorkspaceCompanies(db, userId, workspaceId);
  const rows: CabinetClientRow[] = [];

  for (const co of companies) {
    const health = await computeCompanyHealth(db, userId, co.id);
    const { data: cc } = await db
      .from('atlas_cabinet_clients')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('company_id', co.id)
      .maybeSingle();

    rows.push({
      id: cc?.id ? String(cc.id) : co.id,
      workspaceId,
      companyId: co.id,
      clientLabel: cc?.client_label ? String(cc.client_label) : co.name,
      contactName: cc?.contact_name ? String(cc.contact_name) : null,
      contactEmail: cc?.contact_email ? String(cc.contact_email) : null,
      healthScore: health.score,
      readinessScore: health.readinessScore,
      healthBand: health.band,
      alertCount: health.alertCount,
      companyName: co.name,
    });

    await db.from('atlas_cabinet_clients').upsert({
      workspace_id: workspaceId,
      company_id: co.id,
      client_label: co.name,
      health_score: health.score,
      readiness_score: health.readinessScore,
      health_band: health.band,
      alert_count: health.alertCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,company_id' });
  }

  return rows.sort((a, b) => a.healthScore - b.healthScore);
}

export async function buildConsolidatedDashboard(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<ConsolidatedDashboard> {
  const portfolio = await buildCabinetPortfolio(db, userId, workspaceId);

  let totalInvoices = 0;
  let totalTvaAlerts = 0;
  let totalPayrollDrafts = 0;

  for (const p of portfolio) {
    const [inv, tva, pay] = await Promise.all([
      db.from('atlas_invoices').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('company_id', p.companyId),
      db.from('zafirix_tva_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('company_id', p.companyId).eq('validation_status', 'rejected'),
      db.from('atlas_payslip_extractions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('company_id', p.companyId).eq('validation_status', 'draft'),
    ]);
    totalInvoices += inv.count ?? 0;
    totalTvaAlerts += tva.count ?? 0;
    totalPayrollDrafts += pay.count ?? 0;
  }

  const totalAlerts = portfolio.reduce((s, p) => s + p.alertCount, 0);
  const avgReadiness = portfolio.length
    ? Math.round(portfolio.reduce((s, p) => s + p.readinessScore, 0) / portfolio.length)
    : 0;
  const avgHealth = portfolio.length
    ? Math.round(portfolio.reduce((s, p) => s + p.healthScore, 0) / portfolio.length)
    : 0;

  return {
    companyCount: portfolio.length,
    totalInvoices,
    totalTvaAlerts,
    totalPayrollDrafts,
    totalAlerts,
    avgReadiness,
    avgHealth,
    companies: portfolio.map((p) => ({
      companyId: p.companyId,
      name: p.clientLabel,
      readiness: p.readinessScore,
      health: p.healthScore,
      alerts: p.alertCount,
    })),
  };
}

export async function logCompanySwitch(
  db: SupabaseClient,
  userId: string,
  fromCompanyId: string | null,
  toCompanyId: string,
): Promise<void> {
  await logAuditEvent({
    entityType: 'routing_record',
    entityId: toCompanyId,
    action: 'reviewed',
    performedBy: userId,
    companyId: toCompanyId,
    metadata: {
      event: 'company_switch',
      from_company_id: fromCompanyId,
      to_company_id: toCompanyId,
    },
  });
}

export async function logRoleAssignment(
  db: SupabaseClient,
  userId: string,
  targetUserId: string,
  roleSlug: string,
  workspaceId: string | null,
  companyId: string | null,
): Promise<void> {
  await logAuditEvent({
    entityType: 'routing_record',
    entityId: targetUserId,
    action: 'created',
    performedBy: userId,
    companyId,
    metadata: {
      event: 'role_assignment',
      target_user_id: targetUserId,
      role_slug: roleSlug,
      workspace_id: workspaceId,
    },
  });
}

function mapWorkspace(row: Record<string, unknown>): AtlasWorkspace {
  return {
    id: String(row.id),
    name: String(row.name),
    workspaceType: String(row.workspace_type) as AtlasWorkspace['workspaceType'],
    ownerUserId: String(row.owner_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function switchActiveCompanyServer(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: owned } = await db
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!owned?.id) return { ok: false, error: 'company_not_found' };

  const now = new Date().toISOString();
  const { error: offErr } = await db
    .from('atlas_companies')
    .update({ is_active: false, updated_at: now })
    .eq('user_id', userId);
  if (offErr) return { ok: false, error: offErr.message };

  const { error: onErr } = await db
    .from('atlas_companies')
    .update({ is_active: true, updated_at: now })
    .eq('id', companyId)
    .eq('user_id', userId);
  if (onErr) return { ok: false, error: onErr.message };

  return { ok: true };
}

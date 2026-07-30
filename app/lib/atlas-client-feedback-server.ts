/**
 * Client Feedback Score — NPS/CSAT requests, QuickShareHub links, trend analytics.
 */

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicAppUrl } from '@/app/lib/atlas-app-url';
import type {
  AtlasFeedbackRequest,
  AtlasFeedbackResponse,
  FeedbackChannel,
  FeedbackDashboard,
  FeedbackDashboardSummary,
  FeedbackSourceType,
  FeedbackTrendPoint,
  PublicFeedbackForm,
} from '@/app/types/atlas-client-feedback';
import {
  CHANNEL_LABELS,
  computeNps,
  npsCategory,
  REQUEST_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
} from '@/app/types/atlas-client-feedback';

export { CHANNEL_LABELS, REQUEST_STATUS_LABELS, SOURCE_TYPE_LABELS };

function buildShareUrl(token: string, origin?: string): string {
  const base = origin ?? getPublicAppUrl();
  return `${base}/feedback/${token}`;
}

export function buildFeedbackShareMessage(params: {
  clientName?: string;
  subjectLabel: string;
  shareUrl: string;
  companyName?: string;
}): string {
  const greeting = params.clientName?.trim() ? `Bonjour ${params.clientName.trim()}` : 'Bonjour';
  const company = params.companyName?.trim() ? `\n— ${params.companyName.trim()}` : '';
  return (
    `${greeting},\n\n` +
    `Votre avis compte pour nous concernant « ${params.subjectLabel} ».\n` +
    `Merci de répondre en 1 minute via ce lien sécurisé :\n${params.shareUrl}\n\n` +
    `مرحباً، رأيكم يهمنا. يرجى تعبئة الاستبيان عبر الرابط أعلاه.` +
    company
  );
}

function rowToResponse(row: Record<string, unknown>): AtlasFeedbackResponse {
  const npsScore = Number(row.nps_score ?? 0);
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    satisfactionScore: Number(row.satisfaction_score ?? 0),
    npsScore,
    comment: (row.comment as string | null) ?? null,
    respondentName: (row.respondent_name as string | null) ?? null,
    submittedAt: String(row.submitted_at ?? ''),
    npsCategory: npsCategory(npsScore),
  };
}

export function rowToFeedbackRequest(
  row: Record<string, unknown>,
  response: AtlasFeedbackResponse | null = null,
  origin?: string,
): AtlasFeedbackRequest {
  const token = String(row.token ?? '');
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    sourceType: row.source_type as FeedbackSourceType,
    invoiceId: (row.invoice_id as string | null) ?? null,
    projectId: (row.project_id as string | null) ?? null,
    clientId: (row.client_id as string | null) ?? null,
    clientName: (row.client_name as string | null) ?? null,
    clientEmail: (row.client_email as string | null) ?? null,
    clientPhone: (row.client_phone as string | null) ?? null,
    subjectLabel: String(row.subject_label ?? ''),
    status: row.status as AtlasFeedbackRequest['status'],
    channel: row.channel as AtlasFeedbackRequest['channel'],
    token,
    shareUrl: token ? buildShareUrl(token, origin) : null,
    sentAt: (row.sent_at as string | null) ?? null,
    openedAt: (row.opened_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    response,
  };
}

async function loadResponsesForRequests(
  admin: SupabaseClient,
  requestIds: string[],
): Promise<Map<string, AtlasFeedbackResponse>> {
  const map = new Map<string, AtlasFeedbackResponse>();
  if (requestIds.length === 0) return map;

  const { data } = await admin
    .from('zafirix_feedback_responses')
    .select('*')
    .in('request_id', requestIds);

  for (const row of data ?? []) {
    map.set(String(row.request_id), rowToResponse(row as Record<string, unknown>));
  }
  return map;
}

function buildSummary(requests: AtlasFeedbackRequest[]): FeedbackDashboardSummary {
  const completed = requests.filter((r) => r.status === 'completed' || r.response);
  const responses = completed.map((r) => r.response!).filter(Boolean);
  const npsScores = responses.map((r) => r.npsScore);
  const satScores = responses.map((r) => r.satisfactionScore);

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const s of npsScores) {
    const cat = npsCategory(s);
    if (cat === 'promoter') promoters++;
    else if (cat === 'passive') passives++;
    else detractors++;
  }

  const totalRequests = requests.length;
  const completedCount = completed.length;
  const pending = requests.filter((r) => !r.response && r.status !== 'expired').length;

  return {
    totalRequests,
    completed: completedCount,
    pending,
    responseRate: totalRequests > 0 ? Math.round((completedCount / totalRequests) * 100) : 0,
    avgSatisfaction: satScores.length
      ? Math.round((satScores.reduce((a, b) => a + b, 0) / satScores.length) * 10) / 10
      : null,
    nps: computeNps(npsScores),
    promoters,
    passives,
    detractors,
  };
}

function buildTrends(requests: AtlasFeedbackRequest[]): FeedbackTrendPoint[] {
  const byMonth = new Map<string, { sat: number[]; nps: number[] }>();

  for (const req of requests) {
    if (!req.response) continue;
    const month = req.response.submittedAt.slice(0, 7);
    const bucket = byMonth.get(month) ?? { sat: [], nps: [] };
    bucket.sat.push(req.response.satisfactionScore);
    bucket.nps.push(req.response.npsScore);
    byMonth.set(month, bucket);
  }

  const months = [...byMonth.keys()].sort().slice(-6);
  return months.map((month) => {
    const bucket = byMonth.get(month)!;
    return {
      month,
      responseCount: bucket.nps.length,
      avgSatisfaction: bucket.sat.length
        ? Math.round((bucket.sat.reduce((a, b) => a + b, 0) / bucket.sat.length) * 10) / 10
        : null,
      nps: computeNps(bucket.nps),
    };
  });
}

export async function buildFeedbackDashboard(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  origin?: string,
): Promise<FeedbackDashboard> {
  const { data: rows, error } = await admin
    .from('zafirix_feedback_requests')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const ids = (rows ?? []).map((r) => String(r.id));
  const responses = await loadResponsesForRequests(admin, ids);

  const requests = (rows ?? []).map((r) =>
    rowToFeedbackRequest(
      r as Record<string, unknown>,
      responses.get(String(r.id)) ?? null,
      origin,
    ),
  );

  return {
    requests,
    summary: buildSummary(requests),
    trends: buildTrends(requests),
  };
}

async function createShareLinkRecord(
  admin: SupabaseClient,
  params: {
    companyId: string;
    userId: string;
    requestId: string;
    token: string;
    expiresAt: string;
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from('zafirix_share_links')
    .insert({
      company_id: params.companyId,
      created_by: params.userId,
      entity_type: 'feedback_request',
      entity_id: params.requestId,
      token: params.token,
      permissions: 'read_only',
      expires_at: params.expiresAt,
    })
    .select('id')
    .single();

  if (error) return null;
  return data ? String(data.id) : null;
}

export async function createFeedbackRequest(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    sourceType: FeedbackSourceType;
    subjectLabel: string;
    invoiceId?: string;
    projectId?: string;
    clientId?: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    channel?: FeedbackChannel;
    expiresInDays?: number;
    markSent?: boolean;
  },
  origin?: string,
): Promise<AtlasFeedbackRequest> {
  const token = randomBytes(32).toString('hex');
  const expiresInDays = input.expiresInDays ?? 30;
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
  const now = new Date().toISOString();

  const { data: row, error } = await admin
    .from('zafirix_feedback_requests')
    .insert({
      user_id: userId,
      company_id: companyId,
      source_type: input.sourceType,
      invoice_id: input.invoiceId ?? null,
      project_id: input.projectId ?? null,
      client_id: input.clientId ?? null,
      client_name: input.clientName ?? null,
      client_email: input.clientEmail ?? null,
      client_phone: input.clientPhone ?? null,
      subject_label: input.subjectLabel,
      status: input.markSent ? 'sent' : 'pending',
      channel: input.channel ?? 'link',
      token,
      expires_at: expiresAt,
      sent_at: input.markSent ? now : null,
    })
    .select('*')
    .single();

  if (error || !row) throw new Error(error?.message ?? 'feedback_request_failed');

  const requestId = String(row.id);
  const shareLinkId = await createShareLinkRecord(admin, {
    companyId,
    userId,
    requestId,
    token,
    expiresAt,
  });

  if (shareLinkId) {
    await admin
      .from('zafirix_feedback_requests')
      .update({ share_link_id: shareLinkId })
      .eq('id', requestId);
  }

  return rowToFeedbackRequest(row as Record<string, unknown>, null, origin);
}

export async function createFeedbackRequestForInvoice(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  invoiceId: string,
  options?: { channel?: FeedbackChannel; markSent?: boolean },
  origin?: string,
): Promise<AtlasFeedbackRequest> {
  const { data: invoice, error } = await admin
    .from('atlas_invoices')
    .select('id, number, client_name, client_id, total_ttc')
    .eq('id', invoiceId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!invoice) throw new Error('invoice_not_found');

  return createFeedbackRequest(
    admin,
    userId,
    companyId,
    {
      sourceType: 'invoice',
      subjectLabel: `Facture ${invoice.number}`,
      invoiceId: String(invoice.id),
      clientId: invoice.client_id ? String(invoice.client_id) : undefined,
      clientName: String(invoice.client_name ?? ''),
      channel: options?.channel ?? 'whatsapp',
      markSent: options?.markSent ?? true,
    },
    origin,
  );
}

export async function createFeedbackRequestForProject(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  projectId: string,
  options?: { clientName?: string; channel?: FeedbackChannel; markSent?: boolean },
  origin?: string,
): Promise<AtlasFeedbackRequest> {
  const { data: project, error } = await admin
    .from('atlas_projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!project) throw new Error('project_not_found');

  return createFeedbackRequest(
    admin,
    userId,
    companyId,
    {
      sourceType: 'project',
      subjectLabel: `Projet ${project.name}`,
      projectId: String(project.id),
      clientName: options?.clientName,
      channel: options?.channel ?? 'link',
      markSent: options?.markSent ?? false,
    },
    origin,
  );
}

export async function getPublicFeedbackForm(
  admin: SupabaseClient,
  token: string,
): Promise<PublicFeedbackForm | null> {
  const { data: link } = await admin
    .from('zafirix_share_links')
    .select('entity_id, expires_at, revoked_at')
    .eq('token', token)
    .eq('entity_type', 'feedback_request')
    .maybeSingle();

  const { data: req, error } = await admin
    .from('zafirix_feedback_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error || !req) return null;

  if (link?.revoked_at) return null;
  const expiresAt = (link?.expires_at as string | null) ?? (req.expires_at as string | null);
  if (expiresAt && new Date(expiresAt) < new Date()) {
    await admin.from('zafirix_feedback_requests').update({ status: 'expired' }).eq('id', String(req.id));
    return null;
  }

  const { data: response } = await admin
    .from('zafirix_feedback_responses')
    .select('id')
    .eq('request_id', String(req.id))
    .maybeSingle();

  let companyName: string | null = null;
  if (req.company_id) {
    const { data: co } = await admin
      .from('atlas_companies')
      .select('name')
      .eq('id', String(req.company_id))
      .maybeSingle();
    companyName = co?.name ? String(co.name) : null;
  }

  if (!req.opened_at && req.status !== 'completed') {
    await admin
      .from('zafirix_feedback_requests')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', String(req.id));
  }

  void admin
    .from('zafirix_share_links')
    .update({
      accessed_count: 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('token', token);

  return {
    subjectLabel: String(req.subject_label ?? ''),
    companyName,
    clientName: (req.client_name as string | null) ?? null,
    alreadySubmitted: Boolean(response),
    expiresAt,
  };
}

export async function submitFeedbackResponse(
  admin: SupabaseClient,
  token: string,
  input: {
    satisfactionScore: number;
    npsScore: number;
    comment?: string;
    respondentName?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: req } = await admin
    .from('zafirix_feedback_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!req) return { ok: false, error: 'request_not_found' };

  if (req.expires_at && new Date(String(req.expires_at)) < new Date()) {
    return { ok: false, error: 'request_expired' };
  }

  const { data: existing } = await admin
    .from('zafirix_feedback_responses')
    .select('id')
    .eq('request_id', String(req.id))
    .maybeSingle();

  if (existing) return { ok: false, error: 'already_submitted' };

  if (input.satisfactionScore < 1 || input.satisfactionScore > 5) {
    return { ok: false, error: 'invalid_satisfaction' };
  }
  if (input.npsScore < 0 || input.npsScore > 10) {
    return { ok: false, error: 'invalid_nps' };
  }

  const { error: insertErr } = await admin.from('zafirix_feedback_responses').insert({
    user_id: String(req.user_id),
    company_id: req.company_id,
    request_id: String(req.id),
    satisfaction_score: input.satisfactionScore,
    nps_score: input.npsScore,
    comment: input.comment?.slice(0, 2000) ?? null,
    respondent_name: input.respondentName?.slice(0, 120) ?? null,
  });

  if (insertErr) return { ok: false, error: insertErr.message };

  await admin
    .from('zafirix_feedback_requests')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', String(req.id));

  return { ok: true };
}

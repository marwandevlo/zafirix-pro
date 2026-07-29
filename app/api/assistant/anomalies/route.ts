/**
 * GET /api/assistant/anomalies — list open anomalies (?refresh=1 to re-detect)
 * POST — force refresh detection
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { detectAtlasAiAnomalies, persistAtlasAiAnomalies } from '@/app/lib/atlas-ai-anomalies';
import { logAtlasAiInteraction } from '@/app/lib/atlas-ai-interactions';
import { isMissingTableError } from '@/app/lib/atlas-api-company-guard';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapAnomalyRow(r: Record<string, unknown>) {
  const details = (r.details && typeof r.details === 'object') ? r.details as Record<string, unknown> : {};
  return {
    id: String(r.id),
    category: String(r.category),
    severity: String(r.severity),
    title: String(r.title),
    description: String(r.description),
    entityType: r.entity_type,
    entityId: r.entity_id,
    status: String(r.status),
    detectedAt: String(r.detected_at),
    code: details.code ? String(details.code) : undefined,
    href: details.href ? String(details.href) : undefined,
  };
}

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const refresh = request.nextUrl.searchParams.get('refresh') === '1';
  const db = getSupabaseServiceRoleClient();

  if (refresh) {
    const { anomalies: detected, readinessScore } = await detectAtlasAiAnomalies(db, userId, companyId);
    const persisted = await persistAtlasAiAnomalies(db, userId, companyId, detected);
    await logAtlasAiInteraction(db, {
      userId,
      companyId,
      interactionType: 'insight',
      prompt: 'anomaly_scan_refresh',
      answer: JSON.stringify({ detected: detected.length, readiness_score: readinessScore }),
      sourcesUsed: detected.map((a) => ({ type: 'anomaly', id: a.code, label: a.title })),
      metadata: { codes: detected.map((a) => a.code) },
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      refreshed: true,
      anomalies: persisted,
      readiness_score: readinessScore,
      counts: {
        critical: persisted.filter((a) => a.severity === 'critical').length,
        warning: persisted.filter((a) => a.severity === 'warning').length,
        info: persisted.filter((a) => a.severity === 'info').length,
      },
    });
  }

  let q = db.from('atlas_ai_anomalies').select('*').eq('user_id', userId).eq('status', 'open').order('detected_at', { ascending: false });
  if (companyId) q = q.eq('company_id', companyId);
  else q = q.is('company_id', null);

  const { data, error } = await q.limit(100);
  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json({
        ok: true,
        anomalies: [],
        warning: 'Module IA en cours de déploiement — tables absentes.',
        counts: { critical: 0, warning: 0, info: 0, total: 0 },
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const anomalies = (data ?? []).map((r) => mapAnomalyRow(r as Record<string, unknown>));

  return NextResponse.json({
    ok: true,
    anomalies,
    counts: {
      critical: anomalies.filter((a) => a.severity === 'critical').length,
      warning: anomalies.filter((a) => a.severity === 'warning').length,
      info: anomalies.filter((a) => a.severity === 'info').length,
      total: anomalies.length,
    },
  });
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { companyId?: string | null };
  const companyId = body.companyId?.trim() || null;
  const db = getSupabaseServiceRoleClient();

  const { anomalies: detected, readinessScore } = await detectAtlasAiAnomalies(db, userId, companyId);
  const anomalies = await persistAtlasAiAnomalies(db, userId, companyId, detected);

  const interactionId = await logAtlasAiInteraction(db, {
    userId,
    companyId,
    interactionType: 'insight',
    prompt: 'anomaly_scan_post',
    answer: JSON.stringify({ detected: detected.length, readiness_score: readinessScore }),
    sourcesUsed: detected.map((a) => ({ type: 'anomaly', id: a.code, label: a.title })),
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    anomalies,
    detected: detected.length,
    readiness_score: readinessScore,
    interaction_id: interactionId,
  });
}

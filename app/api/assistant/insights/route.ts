/**
 * GET /api/assistant/insights — Phase 13A daily insights (runs anomaly scan + audit log)
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { generateAtlasAiInsights } from '@/app/lib/atlas-ai-insights';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const db = getSupabaseServiceRoleClient();

  const result = await generateAtlasAiInsights(db, userId, companyId);

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    insights: result.insights,
    recommendations: result.recommendations,
    readiness_score: result.readinessScore,
    anomaly_count: result.anomalies.length,
    interaction_id: result.interactionId,
  });
}

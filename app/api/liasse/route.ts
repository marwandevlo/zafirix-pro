/**
 * GET /api/liasse — list liasse records
 * POST /api/liasse — generate / refresh liasse for fiscal year
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { generateLiasseForUser, mapLiasseRow } from '@/app/lib/atlas-liasse-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const companyId = params.get('companyId')?.trim() || null;
  const fiscalYear = params.get('fiscalYear') ? Number(params.get('fiscalYear')) : null;

  const admin = getSupabaseServiceRoleClient();
  let q = admin
    .from('zafirix_liasse_fiscale')
    .select('*')
    .eq('user_id', userId)
    .order('fiscal_year', { ascending: false });

  if (companyId) q = q.eq('company_id', companyId);
  if (fiscalYear) q = q.eq('fiscal_year', fiscalYear);

  const { data, error } = await q.limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    records: (data ?? []).map((r) => mapLiasseRow(r as Parameters<typeof mapLiasseRow>[0])),
  });
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    companyId?: string | null;
    fiscalYear?: number;
  };

  const fiscalYear = Number(body.fiscalYear ?? new Date().getFullYear());
  if (!Number.isFinite(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    return NextResponse.json({ error: 'invalid_fiscal_year' }, { status: 400 });
  }

  const companyId = body.companyId?.trim() || null;
  const admin = getSupabaseServiceRoleClient();

  try {
    const record = await generateLiasseForUser(admin, userId, companyId, fiscalYear);
    return NextResponse.json({ ok: true, record });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'generate_failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

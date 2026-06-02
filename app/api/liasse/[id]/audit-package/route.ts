/**
 * GET /api/liasse/[id]/audit-package — fiscal audit export JSON
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { buildAuditPackage } from '@/app/lib/atlas-liasse-engine';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await ctx.params;
  const admin = getSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from('zafirix_liasse_fiscale')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const pkg = await buildAuditPackage(admin, userId, {
    id: data.id as string,
    company_id: data.company_id as string | null,
    fiscal_year: data.fiscal_year as number,
    status: data.status as string,
    readiness_score: Number(data.readiness_score ?? 0),
    payload: (data.payload ?? {}) as Record<string, unknown>,
    validation_result: (data.validation_result ?? {}) as Record<string, unknown>,
  });

  const download = request.nextUrl.searchParams.get('download') === '1';
  if (download) {
    const filename = `liasse-audit-${data.fiscal_year}-${id.slice(0, 8)}.json`;
    return new NextResponse(JSON.stringify(pkg, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({ ok: true, package: pkg });
}

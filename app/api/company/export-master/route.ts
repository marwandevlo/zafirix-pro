/**
 * GET /api/company/export-master?companyId=&fiscalYear=
 * Generates a multi-sheet Excel dossier complet for the active company.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { loadMasterExportData } from '@/app/lib/atlas-master-export-data';
import { generateMasterExportBuffer, masterExportFilename } from '@/app/lib/atlas-master-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId')?.trim();
  const fiscalYearParam = searchParams.get('fiscalYear');
  const fiscalYear = fiscalYearParam ? Number(fiscalYearParam) : new Date().getFullYear();

  if (!companyId) {
    return NextResponse.json(
      { error: 'company_required', message: 'Société active requise.' },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const admin = getSupabaseServiceRoleClient();

    const { data: owned } = await admin
      .from('atlas_companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!owned) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404, headers: NO_STORE });
    }

    const data = await loadMasterExportData(admin, userId, companyId, fiscalYear);
    const buffer = await generateMasterExportBuffer(data);
    const filename = masterExportFilename(data.companyName, data.fiscalYear);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    console.error('[company/export-master]', message, err);
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { buildMoroccanFiscalDeadlines } from '@/app/lib/atlas-fiscal-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const radar = buildMoroccanFiscalDeadlines(new Date(), companyId);

  return NextResponse.json({ ok: true, ...radar });
}

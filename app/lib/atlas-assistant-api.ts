import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export async function assistantApiContext(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return { error: NextResponse.json({ error: 'auth_required' }, { status: 401 }) };

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim()
    || (await request.json().catch(() => ({})) as { companyId?: string })?.companyId?.trim()
    || null;

  const db = getSupabaseServiceRoleClient();
  return { userId, companyId, db };
}

export function parseBodyCompanyId(body: { companyId?: string | null }): string | null {
  const c = body.companyId?.trim();
  return c || null;
}

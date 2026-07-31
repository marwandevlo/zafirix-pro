import { NextRequest, NextResponse } from 'next/server';
import { clearAtlasCompanyDataServer } from '@/app/lib/atlas-company-clear-server';
import { atlasCompanyErrorMessage } from '@/app/lib/atlas-companies-repository';

type RouteContext = { params: Promise<{ companyId: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const { companyId } = await context.params;
  const id = companyId?.trim();
  if (!id) {
    return NextResponse.json({ error: 'company_id_required' }, { status: 400 });
  }

  const result = await clearAtlasCompanyDataServer(id);
  if (!result.ok) {
    const status =
      result.error === 'auth_required' ? 401 :
      result.error === 'company_not_found_or_forbidden' ? 403 :
      result.error === 'supabase_required' ? 400 :
      500;
    return NextResponse.json(
      { error: result.error, message: atlasCompanyErrorMessage(result.error) },
      { status },
    );
  }

  return NextResponse.json({ ok: true, clearedTables: result.clearedTables });
}

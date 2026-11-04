/**
 * GET  /api/business-studio/studies?companyId=&includeArchived=1  — the caller's studies (v2 and legacy)
 * POST /api/business-studio/studies                                — create from a model or a sector template
 */
import { NextResponse, type NextRequest } from 'next/server';
import { noStore, readJsonBody, withStudio } from '@/app/lib/business-studio/api-helpers';
import { createStudy, listStudies } from '@/app/lib/business-studio/server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return withStudio(request, async ({ db, userId }) => {
    const sp = request.nextUrl.searchParams;
    const studies = await listStudies(db, userId, { companyId: sp.get('companyId') || null, includeArchived: sp.get('includeArchived') === '1' });
    return NextResponse.json({ studies }, noStore);
  });
}

export async function POST(request: NextRequest) {
  return withStudio(request, async ({ db, userId }) => {
    const body = await readJsonBody(request);
    const study = await createStudy(db, userId, {
      name: body.name, companyId: body.companyId, model: body.model, template: body.template,
      years: body.years, startMonth: body.startMonth, projectType: body.projectType,
    });
    return NextResponse.json({ study }, { status: 201, ...noStore });
  });
}

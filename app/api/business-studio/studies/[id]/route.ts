/**
 * GET   /api/business-studio/studies/[id]  — study with model, revision and audit trail
 * PUT   /api/business-studio/studies/[id]  — save { model?, name?, revision } (409 on stale revision)
 * PATCH /api/business-studio/studies/[id]  — status { action: submit|approve|reopen|archive|restore, revision }
 *                                            or sharing { action: 'share', sharing: private|company_read|company_edit, revision }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { noStore, readJsonBody, withStudio } from '@/app/lib/business-studio/api-helpers';
import { changeStatus, getStudy, saveStudy, setSharing } from '@/app/lib/business-studio/server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    return NextResponse.json({ study: await getStudy(db, userId, id) }, noStore);
  });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    const body = await readJsonBody(request);
    const study = await saveStudy(db, userId, id, { model: body.model, name: body.name, revision: body.revision });
    return NextResponse.json({ study }, noStore);
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    const body = await readJsonBody(request);
    const study = body.action === 'share'
      ? await setSharing(db, userId, id, { sharing: body.sharing, revision: body.revision })
      : await changeStatus(db, userId, id, { action: body.action, revision: body.revision });
    return NextResponse.json({ study }, noStore);
  });
}

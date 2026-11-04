/**
 * GET  /api/business-studio/studies/[id]/versions/[versionId] — snapshot model (for comparison)
 * POST /api/business-studio/studies/[id]/versions/[versionId] — { action: 'restore', revision }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { noStore, readJsonBody, withStudio } from '@/app/lib/business-studio/api-helpers';
import { getVersion, restoreVersion, StoreError } from '@/app/lib/business-studio/server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; versionId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id, versionId } = await params;
    return NextResponse.json({ version: await getVersion(db, userId, id, versionId) }, noStore);
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id, versionId } = await params;
    const body = await readJsonBody(request);
    if (body.action !== 'restore') throw new StoreError(400, 'invalid_action');
    return NextResponse.json({ study: await restoreVersion(db, userId, id, versionId, { revision: body.revision }) }, noStore);
  });
}

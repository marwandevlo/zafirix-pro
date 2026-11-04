/**
 * GET  /api/business-studio/studies/[id]/versions — snapshots of the study
 * POST /api/business-studio/studies/[id]/versions — snapshot the current revision { label? }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { noStore, readJsonBody, withStudio } from '@/app/lib/business-studio/api-helpers';
import { createVersion, listVersions } from '@/app/lib/business-studio/server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    return NextResponse.json({ versions: await listVersions(db, userId, id) }, noStore);
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    const body = await readJsonBody(request);
    return NextResponse.json({ version: await createVersion(db, userId, id, { label: body.label }) }, { status: 201, ...noStore });
  });
}

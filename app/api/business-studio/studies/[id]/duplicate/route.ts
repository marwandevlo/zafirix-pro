/** POST /api/business-studio/studies/[id]/duplicate — new draft study with the same model */
import { NextResponse, type NextRequest } from 'next/server';
import { noStore, readJsonBody, withStudio } from '@/app/lib/business-studio/api-helpers';
import { duplicateStudy } from '@/app/lib/business-studio/server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    const body = await readJsonBody(request);
    return NextResponse.json({ study: await duplicateStudy(db, userId, id, { name: body.name }) }, { status: 201, ...noStore });
  });
}

/** POST /api/business-studio/legacy/[id]/import — creates a new study from a legacy one; the legacy row is untouched */
import { NextResponse, type NextRequest } from 'next/server';
import { noStore, withStudio } from '@/app/lib/business-studio/api-helpers';
import { importLegacy } from '@/app/lib/business-studio/server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    const { study, notes } = await importLegacy(db, userId, id);
    return NextResponse.json({ study, notes }, { status: 201, ...noStore });
  });
}

/**
 * GET /api/business-studio/studies/[id]/actuals?includeUnvalidated=1
 * Read-only: journal lines of the study's company over the study horizon, aggregated by month and CGNC class.
 * This route never writes to accounting tables.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { noStore, withStudio } from '@/app/lib/business-studio/api-helpers';
import { ACTUAL_STATUSES_DEFAULT, ACTUAL_STATUSES_WITH_UNVALIDATED, aggregateActuals } from '@/app/lib/business-studio/actuals';
import { buildCalendar } from '@/app/lib/business-studio/engine';
import { getStudy, readActualLines } from '@/app/lib/business-studio/server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    const includeUnvalidated = request.nextUrl.searchParams.get('includeUnvalidated') === '1';
    const study = await getStudy(db, userId, id);
    const h = study.meta.model.horizon;
    const cal = buildCalendar(h.startMonth, h.years, h.fiscalYearStartMonth);
    const { lines, truncated } = await readActualLines(db, userId, id, { includeUnvalidated });
    const actuals = aggregateActuals(lines, cal.labels, includeUnvalidated ? ACTUAL_STATUSES_WITH_UNVALIDATED : ACTUAL_STATUSES_DEFAULT);
    return NextResponse.json({ actuals, truncated, includeUnvalidated }, noStore);
  });
}

/**
 * Restores the model snapshot taken at the last confirmed apply.
 * Refuses when the study revision moved again after that apply.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { noStore, readJsonBody, withStudio } from '@/app/lib/business-studio/api-helpers';
import { canApplyCopilot, publicThread } from '@/app/lib/business-studio/copilot';
import { loadCopilotThread, saveCopilotThread } from '@/app/lib/business-studio/copilot-store';
import { getStudy, saveStudy, StoreError } from '@/app/lib/business-studio/server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withStudio(request, async ({ db, userId }) => {
    const { id } = await params;
    const study = await getStudy(db, userId, id);
    const body = await readJsonBody(request);
    if (!canApplyCopilot(study.access.level)) throw new StoreError(403, 'read_only');
    if (body.confirm !== true) throw new StoreError(400, 'confirm_required');
    if (body.revision !== study.meta.revision) throw new StoreError(409, 'revision_conflict', { currentRevision: study.meta.revision });
    const loaded = await loadCopilotThread(db, userId, id);
    const undo = loaded.thread.undo;
    if (!undo || undo.revision !== study.meta.revision) throw new StoreError(409, 'undo_unavailable');
    const saved = await saveStudy(db, userId, id, { model: undo.model, revision: study.meta.revision });
    const thread = { ...loaded.thread, undo: null, pending: null, threadRevision: loaded.thread.threadRevision + 1 };
    await saveCopilotThread(db, userId, id, study.companyId, loaded.rowId, thread);
    return NextResponse.json({ study: saved, thread: publicThread(thread) }, noStore);
  });
}

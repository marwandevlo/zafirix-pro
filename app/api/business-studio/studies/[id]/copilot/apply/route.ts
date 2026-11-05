/**
 * Applies a confirmed subset of the pending proposal through the same save path as the study editor.
 * Financial totals are not accepted from the client; the stored model is patched and revalidated.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { noStore, readJsonBody, withStudio } from '@/app/lib/business-studio/api-helpers';
import { applyProposal, evaluateApply, publicThread } from '@/app/lib/business-studio/copilot';
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
    const loaded = await loadCopilotThread(db, userId, id);
    const decision = evaluateApply({
      confirm: body.confirm,
      revision: body.revision,
      currentRevision: study.meta.revision,
      changeIds: body.changeIds,
      proposal: loaded.thread.pending,
      access: study.access.level,
      locked: study.meta.studyStatus === 'approved' || study.meta.studyStatus === 'archived',
    });
    if (!decision.ok) throw new StoreError(decision.status, decision.code);
    const nextModel = applyProposal(study.meta.model, loaded.thread.pending!, decision.changeIds);
    const saved = await saveStudy(db, userId, id, { model: nextModel, revision: study.meta.revision });
    const thread = {
      ...loaded.thread,
      pending: null,
      undo: { revision: saved.meta.revision, model: study.meta.model },
      threadRevision: loaded.thread.threadRevision + 1,
    };
    await saveCopilotThread(db, userId, id, study.companyId, loaded.rowId, thread);
    return NextResponse.json({ study: saved, thread: publicThread(thread) }, noStore);
  });
}

/**
 * Copilot transcripts live in their own `atlas_projects` rows (`metadata.kind = business_study_copilot`).
 * Study lists only read business_study_v2 and legacy studies, so a transcript never appears as a study and
 * never changes the study model. The row is owned by the signed-in user and filtered by that user id.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseThread, type CopilotThread } from './copilot';
import { StoreError } from './server-store';

const TABLE = 'atlas_projects';
export const COPILOT_KIND = 'business_study_copilot';

type Db = SupabaseClient;

export async function loadCopilotThread(db: Db, userId: string, studyId: string): Promise<{ rowId: string | null; thread: CopilotThread }> {
  const { data, error } = await db
    .from(TABLE)
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('metadata->>kind', COPILOT_KIND)
    .eq('metadata->>studyId', studyId)
    .limit(1);
  if (error) throw new StoreError(500, 'copilot_read_failed');
  const row = (data ?? [])[0] as { id?: string; metadata?: unknown } | undefined;
  if (!row?.id) return { rowId: null, thread: parseThread(null) };
  return { rowId: String(row.id), thread: parseThread(row.metadata) };
}

export async function saveCopilotThread(
  db: Db,
  userId: string,
  studyId: string,
  companyId: string | null,
  rowId: string | null,
  thread: CopilotThread,
): Promise<string> {
  const metadata = { kind: COPILOT_KIND, studyId, ...thread };
  if (!rowId) {
    const { data, error } = await db
      .from(TABLE)
      .insert({ user_id: userId, company_id: companyId, name: `Copilot ${studyId}`.slice(0, 200), status: 'draft', metadata })
      .select('id')
      .single();
    if (error || !data) throw new StoreError(500, 'copilot_write_failed');
    return String((data as { id: string }).id);
  }
  const { data, error } = await db
    .from(TABLE)
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', rowId)
    .eq('user_id', userId)
    .eq('metadata->>kind', COPILOT_KIND)
    .eq('metadata->>studyId', studyId)
    .select('id');
  if (error || !data || data.length === 0) throw new StoreError(409, 'copilot_conflict');
  return rowId;
}

/**
 * Cron: recover stuck OCR documents.
 * Vercel schedule: every 10 minutes (see vercel.json).
 *
 * Finds documents stuck in "processing" for > 5 minutes and retriggers OCR.
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { scheduleVercelBackground } from '@/app/lib/atlas-vercel-background';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const STUCK_THRESHOLD_MS = 5 * 60 * 1000;
const MAX_RECOVERY_PER_RUN = 5;

export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServiceRoleClient();
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

  const { data: stuckDocs, error } = await supabase
    .from('atlas_documents')
    .select('id, user_id, updated_at, metadata')
    .eq('processing_status', 'processing')
    .lt('updated_at', cutoff)
    .eq('source', 'ocr')
    .order('updated_at', { ascending: true })
    .limit(MAX_RECOVERY_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!stuckDocs?.length) {
    return NextResponse.json({ recovered: 0, message: 'No stuck documents found' });
  }

  const recovered: string[] = [];

  for (const doc of stuckDocs) {
    const userId = String(doc.user_id ?? '');
    const docId = String(doc.id ?? '');
    if (!userId || !docId) continue;

    scheduleVercelBackground(async () => {
      const { executeDocumentOcrServer } = await import('@/app/lib/atlas-document-ocr-runner');
      await executeDocumentOcrServer(userId, docId, 'retrigger');
    });

    recovered.push(docId);
  }

  return NextResponse.json({ recovered: recovered.length, documentIds: recovered });
}

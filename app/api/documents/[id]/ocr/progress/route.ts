import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { readDocumentOcrProgress } from '@/app/lib/atlas-documents-ocr-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function sessionUserId(request: NextRequest): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* middleware refresh */
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (data.user?.id) return data.user.id;

  const auth = request.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) return null;

  const bearerClient = createServerClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    cookies: { getAll: () => [], setAll: () => {} },
  });
  const { data: bearerUser } = await bearerClient.auth.getUser();
  return bearerUser.user?.id ?? null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: false, code: 'not_enabled' }, { status: 400 });
  }

  const userId = await sessionUserId(request);
  if (!userId) {
    return NextResponse.json({ ok: false, code: 'auth_required' }, { status: 401 });
  }

  const { id: documentId } = await context.params;
  if (!documentId) {
    return NextResponse.json({ ok: false, code: 'document_required' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* noop */
        }
      },
    },
  });

  const result = await readDocumentOcrProgress(supabase, userId, documentId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    processingStatus: result.progress.processingStatus,
    progressPhase: result.progress.progressPhase,
    progressPage: result.progress.progressPage,
    progressTotal: result.progress.progressTotal,
    progressPercent: result.progress.progressPercent,
    fileName: result.progress.fileName,
    mimeType: result.progress.mimeType,
    sizeBytes: result.progress.sizeBytes,
    pageCount: result.progress.pageCount,
    pagesProcessed: result.progress.pagesProcessed,
    startedAt: result.progress.startedAt,
    completedAt: result.progress.completedAt,
    errorMessage: result.progress.errorMessage,
    errorCode: result.progress.errorCode,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { runDocumentOcrJob } from '@/app/lib/atlas-document-ocr-job';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { OCR_PROVIDER } from '@/app/lib/atlas-ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const IS_DEV = process.env.NODE_ENV === 'development';

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled', code: 'not_enabled' }, { status: 400 });
  }

  const userId = await sessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required', code: 'auth_required' }, { status: 401 });
  }

  const { id: documentId } = await context.params;
  if (!documentId) {
    return NextResponse.json({ error: 'document_required', code: 'document_required' }, { status: 400 });
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

  const { data: row, error: rowErr } = await supabase
    .from('atlas_documents')
    .select('id, mime_type, storage_path, filename, size_bytes, metadata')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (rowErr || !row?.id) {
    return NextResponse.json({ error: 'document_not_found', code: 'document_not_found' }, { status: 404 });
  }

  await supabase
    .from('atlas_documents')
    .update({ processing_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('user_id', userId);

  const asyncMode = request.nextUrl.searchParams.get('async') !== '0';

  const rowPayload = {
    id: String(row.id),
    mime_type: row.mime_type,
    storage_path: row.storage_path,
    filename: row.filename,
    size_bytes: row.size_bytes,
    metadata: row.metadata,
  };

  const execute = async () => {
    logAtlasServerEvent('documents/ocr', 'info', 'image_ocr_start', { documentId, userId });
    const result = await runDocumentOcrJob(userId, documentId, rowPayload);
    if (!result.ok) {
      logAtlasServerEvent('documents/ocr', 'error', result.message, {
        documentId,
        userId,
        code: result.code,
        step: 'image_ocr',
      });
    } else {
      logAtlasServerEvent('documents/ocr', 'info', 'image_ocr_complete', { documentId, userId });
    }
    return result;
  };

  if (asyncMode) {
    void execute().then((result) => {
      if (!result.ok) {
        console.error('[documents/ocr-image] background job failed', documentId, result);
      }
    });

    return NextResponse.json(
      { ok: true, accepted: true, documentId, processingStatus: 'processing', provider: OCR_PROVIDER },
      { status: 202 },
    );
  }

  const result = await execute();
  if (!result.ok) {
    return NextResponse.json(
      IS_DEV
        ? { error: result.message, code: result.code, provider: OCR_PROVIDER }
        : { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true, documentId, processingStatus: 'processed' });
}

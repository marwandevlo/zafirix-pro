import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { scheduleVercelBackground } from '@/app/lib/atlas-vercel-background';
import { OCR_PROVIDER } from '@/app/lib/atlas-ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

/** Accepts OCR and runs it via waitUntil (returns immediately — no client hang). */
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

  logAtlasServerEvent('documents/ocr', 'info', 'ocr_run_accepted', { documentId, userId });

  scheduleVercelBackground(async () => {
    const { executeDocumentOcrServer } = await import('@/app/lib/atlas-document-ocr-runner');
    await executeDocumentOcrServer(userId, documentId, 'api_run');
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      documentId,
      processingStatus: 'processing',
      provider: OCR_PROVIDER,
    },
    { status: 202 },
  );
}

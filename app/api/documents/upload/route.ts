import { NextRequest, NextResponse } from 'next/server';

import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { DIRECT_STORAGE_UPLOAD_THRESHOLD_BYTES } from '@/app/lib/atlas-document-upload-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Legacy multipart proxy — disabled for files above threshold.
 * Use prepare → direct Supabase Storage → register instead.
 */
export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json(
      { error: 'not_enabled', code: 'not_enabled', step: 'backend', message: 'Supabase not enabled' },
      { status: 400 },
    );
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > DIRECT_STORAGE_UPLOAD_THRESHOLD_BYTES) {
    return NextResponse.json(
      {
        error: 'use_direct_storage',
        code: 'use_direct_storage',
        step: 'validation',
        message:
          'Les fichiers volumineux doivent être envoyés directement vers Supabase Storage (prepare → register).',
      },
      { status: 410 },
    );
  }

  return NextResponse.json(
    {
      error: 'use_direct_storage',
      code: 'use_direct_storage',
      step: 'validation',
      message:
        'Utilisez le téléversement direct Supabase Storage (/api/documents/upload/prepare puis /register).',
    },
    { status: 410 },
  );
}

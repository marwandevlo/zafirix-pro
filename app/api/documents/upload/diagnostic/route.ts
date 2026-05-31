import { NextRequest, NextResponse } from 'next/server';

import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { logUploadStep } from '@/app/lib/atlas-document-upload-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = (await documentUploadSessionUserId(request)) ?? 'anonymous';

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = { parse: 'failed' };
  }

  logUploadStep(
    String(body.event ?? 'client_diagnostic'),
    'warn',
    String(body.errorMessage ?? body.step ?? 'upload_client_event'),
    {
      userId,
      companyId: typeof body.companyId === 'string' ? body.companyId : undefined,
      documentId: typeof body.documentId === 'string' ? body.documentId : undefined,
      storagePath: typeof body.storagePath === 'string' ? body.storagePath : undefined,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
      fileSize: typeof body.fileSize === 'number' ? body.fileSize : undefined,
    },
    {
      httpStatus: body.httpStatus,
      errorCode: body.errorCode,
      attempt: body.attempt,
      responseBody: body.responseBody,
    },
  );

  return NextResponse.json({ ok: true });
}

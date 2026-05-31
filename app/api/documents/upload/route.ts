import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { prepareUploadedImageForOcr } from '@/app/lib/atlas-document-image-upload';
import {
  ATLAS_DOCUMENTS_BUCKET,
  buildAtlasDocumentStoragePath,
  buildAtlasDocumentWorkingStoragePath,
  formatMaxUploadLabel,
  inferDocumentMimeType,
  isAllowedDocumentMime,
  isPdfMimeType,
  maxUploadBytesForMime,
  sanitizeDocumentFilename,
} from '@/app/lib/atlas-document-storage';
import { isUuid } from '@/app/lib/admin/atlas-admin-profile-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const IS_DEV = process.env.NODE_ENV === 'development';

type UploadDiag = {
  error: string;
  step: string;
  message: string;
  code: string;
  userIdPresent?: boolean;
  companyId?: string;
  mimeType?: string;
  fileSize?: number;
};

function uploadJson(status: number, step: string, code: string, message: string, extra?: Partial<UploadDiag>) {
  const payload: UploadDiag = {
    error: code,
    step,
    message,
    code,
    ...extra,
  };
  if (IS_DEV) {
    console.error('[documents/upload]', payload);
    return NextResponse.json(payload, { status });
  }
  return NextResponse.json({ error: code }, { status });
}

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

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return uploadJson(400, 'backend', 'not_enabled', 'Supabase data backend is not enabled');
  }

  const userId = await sessionUserId(request);
  if (!userId) {
    return uploadJson(401, 'auth', 'auth_required', 'Session user id missing', { userIdPresent: false });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'form_parse_failed';
    return uploadJson(400, 'form_parse', 'form_parse_failed', message, {
      userIdPresent: true,
      fileSize: Number(request.headers.get('content-length') ?? 0) || undefined,
    });
  }

  const file = form.get('file');
  const companyId = String(form.get('companyId') ?? '').trim();

  if (!(file instanceof File)) {
    return uploadJson(400, 'validation', 'file_required', 'Multipart field "file" is required', {
      userIdPresent: true,
      companyId: companyId || undefined,
    });
  }

  const mimeType = inferDocumentMimeType(file);

  if (!companyId || !isUuid(companyId)) {
    return uploadJson(400, 'validation', 'company_required', 'Valid companyId UUID is required', {
      userIdPresent: true,
      companyId: companyId || undefined,
      mimeType,
      fileSize: file.size,
    });
  }

  const maxBytes = maxUploadBytesForMime(mimeType);
  if (file.size > maxBytes) {
    return uploadJson(
      400,
      'validation',
      'file_too_large',
      `File size ${file.size} exceeds limit ${maxBytes} (${formatMaxUploadLabel(mimeType)})`,
      { userIdPresent: true, companyId, mimeType, fileSize: file.size },
    );
  }

  if (!isAllowedDocumentMime(mimeType)) {
    return uploadJson(400, 'validation', 'mime_not_allowed', `MIME type not allowed: ${mimeType || '(empty)'}`, {
      userIdPresent: true,
      companyId,
      mimeType,
      fileSize: file.size,
    });
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

  const { data: companyRow, error: companyErr } = await supabase
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (companyErr || !companyRow?.id) {
    return uploadJson(403, 'company_ownership', 'company_not_found_or_forbidden', companyErr?.message ?? 'Company not owned by user', {
      userIdPresent: true,
      companyId,
      mimeType,
      fileSize: file.size,
      code: companyErr?.code ?? 'company_not_found_or_forbidden',
    });
  }

  const documentId = crypto.randomUUID();
  const safeName = sanitizeDocumentFilename(file.name);
  const storagePath = buildAtlasDocumentStoragePath(userId, companyId, documentId, safeName);
  const bytes = Buffer.from(await file.arrayBuffer());

  let metadata: Record<string, unknown> = {
    storage: {
      original_storage_path: storagePath,
    },
  };

  const { error: insertErr } = await supabase.from('atlas_documents').insert({
    id: documentId,
    user_id: userId,
    company_id: companyId,
    type: 'ocr',
    title: safeName,
    kind: 'upload',
    source: 'ocr',
    status: 'active',
    filename: safeName,
    mime_type: mimeType,
    size_bytes: file.size,
    storage_path: storagePath,
    processing_status: 'uploaded',
    metadata,
  });

  if (insertErr) {
    return uploadJson(500, 'db_insert', insertErr.code ?? 'db_insert_failed', insertErr.message, {
      userIdPresent: true,
      companyId,
      mimeType,
      fileSize: file.size,
    });
  }

  const { error: uploadErr } = await supabase.storage.from(ATLAS_DOCUMENTS_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadErr) {
    await supabase.from('atlas_documents').delete().eq('id', documentId).eq('user_id', userId);
    return uploadJson(500, 'storage_upload', uploadErr.name ?? 'storage_upload_failed', uploadErr.message, {
      userIdPresent: true,
      companyId,
      mimeType,
      fileSize: file.size,
      code: uploadErr.name ?? 'storage_upload_failed',
    });
  }

  if (!isPdfMimeType(mimeType)) {
    try {
      const prepared = await prepareUploadedImageForOcr(bytes, mimeType);
      if (prepared.compressed) {
        const workingPath = buildAtlasDocumentWorkingStoragePath(userId, companyId, documentId);
        const { error: workingErr } = await supabase.storage
          .from(ATLAS_DOCUMENTS_BUCKET)
          .upload(workingPath, prepared.ocrBuffer, {
            contentType: prepared.ocrMimeType,
            upsert: true,
          });

        if (workingErr) {
          await supabase.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([storagePath]);
          await supabase.from('atlas_documents').delete().eq('id', documentId).eq('user_id', userId);
          return uploadJson(500, 'storage_working_copy', 'working_copy_failed', workingErr.message, {
            userIdPresent: true,
            companyId,
            mimeType,
            fileSize: file.size,
          });
        }

        metadata = {
          storage: {
            original_storage_path: storagePath,
            working_storage_path: workingPath,
            compressed: true,
            original_bytes: prepared.originalBytes,
            ocr_bytes: prepared.ocrBytes,
          },
        };

        await supabase
          .from('atlas_documents')
          .update({ metadata, updated_at: new Date().toISOString() })
          .eq('id', documentId)
          .eq('user_id', userId);
      }
    } catch (compressErr) {
      const message = compressErr instanceof Error ? compressErr.message : 'image_compress_failed';
      await supabase.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([storagePath]);
      await supabase.from('atlas_documents').delete().eq('id', documentId).eq('user_id', userId);
      return uploadJson(422, 'image_compress', 'image_compress_failed', message, {
        userIdPresent: true,
        companyId,
        mimeType,
        fileSize: file.size,
      });
    }
  }

  return NextResponse.json({
    document: {
      id: documentId,
      companyId,
      filename: safeName,
      mimeType,
      sizeBytes: file.size,
      storagePath,
      processingStatus: 'uploaded',
      compressed: Boolean((metadata.storage as Record<string, unknown>)?.compressed),
    },
    ...(IS_DEV
      ? {
          debug: {
            step: 'complete',
            userIdPresent: true,
            companyId,
            mimeType,
            fileSize: file.size,
          },
        }
      : {}),
  });
}

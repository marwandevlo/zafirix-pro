/**
 * POST /api/documents/[id]/validate
 * PUT  /api/documents/[id]/validate
 *
 * Validate or reject a processed document.
 * On validated: registers supplier invoices + TVA/journal for each detected page/invoice.
 * Body: { action: 'validated' | 'rejected' | 'needs_correction', note?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { loadDocumentForCompanyAccess } from '@/app/lib/atlas-company-resource-guard';
import {
  markDocumentValidated,
  registerValidatedDocumentRecords,
} from '@/app/lib/atlas-document-validation-server';
import { logDocumentEvent } from '@/app/lib/atlas-document-events';
import { revalidateDocumentSurfaces } from '@/app/lib/revalidate-document-surfaces';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { parseNestedClassification } from '@/app/lib/atlas-ai-json-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type ValidateBody = {
  action?: string;
  note?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  let body: ValidateBody;
  try {
    body = (await request.json()) as ValidateBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const action = String(body.action ?? '').trim();
  if (!['validated', 'rejected', 'needs_correction'].includes(action)) {
    return NextResponse.json(
      { error: 'invalid_action', message: 'action must be validated|rejected|needs_correction' },
      { status: 400 },
    );
  }

  const admin = getSupabaseServiceRoleClient();

  const loaded = await loadDocumentForCompanyAccess(
    admin,
    userId,
    documentId,
    'id, company_id, processing_status, validation_status, document_type, metadata',
  );

  if (!loaded.ok) {
    return NextResponse.json({ error: 'document_not_found' }, { status: loaded.status });
  }

  const doc = loaded.row;

  if (doc.processing_status !== 'processed') {
    return NextResponse.json(
      { error: 'document_not_processed', message: 'Document must be processed before validation' },
      { status: 422 },
    );
  }

  const now = new Date().toISOString();

  if (action === 'validated') {
    const registration = await registerValidatedDocumentRecords(admin, userId, documentId);
    if (!registration.ok) {
      console.error('[documents/validate] registration failed', {
        documentId,
        error: registration.error,
        details: registration.details,
      });
      return NextResponse.json(
        {
          error: registration.error,
          message: registration.message,
          details: registration.details ?? [],
        },
        { status: 422 },
      );
    }

    const meta =
      doc.metadata && typeof doc.metadata === 'object'
        ? (doc.metadata as Record<string, unknown>)
        : {};
    const detected = parseNestedClassification(meta.classification)?.detected_type;
    const docType =
      (doc.document_type as string | null) ??
      (typeof detected === 'string' ? detected : null);

    await markDocumentValidated(
      admin,
      userId,
      documentId,
      loaded.companyId,
      doc.validation_status as string | null,
      registration,
      docType,
    );

    revalidateDocumentSurfaces();

    return NextResponse.json({
      ok: true,
      validation_status: 'validated',
      documentKind: registration.documentKind,
      invoicesCreated: registration.invoicesCreated,
      invoicesSkipped: registration.invoicesSkipped,
      invoiceIds: registration.invoiceIds,
      journalLineCount: registration.journalLineCount,
      tvaAmount: registration.tvaAmount,
      statementId: registration.statementId ?? null,
      transactionCount: registration.transactionCount ?? null,
    });
  }

  const { error: updateErr } = await admin
    .from('atlas_documents')
    .update({
      validation_status: action,
      validated_at: null,
      validated_by: null,
      updated_at: now,
    })
    .eq('id', documentId)
    .eq('company_id', loaded.companyId);

  if (updateErr) {
    return NextResponse.json({ error: 'update_failed', message: updateErr.message }, { status: 500 });
  }

  void logDocumentEvent({
      companyId: loaded.companyId,
      documentId,
      userId,
      eventType: action === 'rejected' ? 'user_rejected' : 'validation_required',
      payload: { action, note: body.note ?? null, previous_status: doc.validation_status },
    });

  revalidateDocumentSurfaces();

  return NextResponse.json({ ok: true, validation_status: action });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return POST(request, context);
}

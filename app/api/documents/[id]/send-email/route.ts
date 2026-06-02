/**
 * POST /api/documents/[id]/send-email
 * Sends a document export or share link by email via Resend.
 * Falls back gracefully when Resend is not configured.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { sendEmailViaResend } from '@/app/lib/atlas-email-resend';
import { buildDocumentExportPayload } from '@/app/lib/atlas-document-export';
import type { AtlasDocument } from '@/app/types/atlas-document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SendEmailBody = {
  to: string;
  subject?: string;
  message?: string;
  /** 'share_link' | 'summary' — what to attach/include */
  contentType?: 'share_link' | 'summary';
  /** Only if contentType is 'share_link' */
  shareToken?: string;
};

function buildEmailHtml(params: {
  filename: string;
  documentType: string;
  supplierName: string;
  invoiceNumber: string;
  totalTtc: string;
  message: string;
  shareLink?: string;
  exportBaseUrl: string;
  documentId: string;
}): string {
  const {
    filename, documentType, supplierName, invoiceNumber,
    totalTtc, message, shareLink, exportBaseUrl, documentId,
  } = params;

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; background: #f9fafb; margin: 0; padding: 20px; }
  .card { background: white; border-radius: 12px; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  .logo { width: 36px; height: 36px; background: #ef4444; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  h1 { font-size: 18px; margin: 0; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; background: #ede9fe; color: #6d28d9; margin-bottom: 16px; text-transform: capitalize; }
  .field-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
  .field-label { font-size: 12px; color: #6b7280; }
  .field-value { font-size: 12px; font-weight: 600; color: #111827; }
  .message-box { background: #f3f4f6; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #374151; margin: 20px 0; }
  .cta { display: inline-block; padding: 12px 24px; background: #ef4444; color: white; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px; }
  .exports { display: flex; gap: 8px; margin-top: 16px; }
  .export-btn { padding: 6px 14px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 11px; font-weight: 600; color: #374151; text-decoration: none; }
  .footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 32px; }
</style></head>
<body>
<div class="card">
  <div class="header">
    <div class="logo" style="color:white;font-weight:bold;font-size:18px;display:flex;align-items:center;justify-content:center;">Z</div>
    <div><strong>Zafirix Pro</strong> · Documents IA</div>
  </div>
  <span class="badge">${documentType.replace(/_/g, ' ')}</span>
  <h1 style="font-size:16px;margin-bottom:20px;">Document partagé : ${filename}</h1>
  ${[
    supplierName && `<div class="field-row"><span class="field-label">Fournisseur</span><span class="field-value">${supplierName}</span></div>`,
    invoiceNumber && `<div class="field-row"><span class="field-label">N° Facture</span><span class="field-value">${invoiceNumber}</span></div>`,
    totalTtc && `<div class="field-row"><span class="field-label">Total TTC</span><span class="field-value">${totalTtc} MAD</span></div>`,
  ].filter(Boolean).join('')}
  ${message ? `<div class="message-box">${message}</div>` : ''}
  ${shareLink ? `<p style="margin-top:24px;margin-bottom:8px;font-size:13px;color:#6b7280;">Accédez au document :</p><a class="cta" href="${shareLink}">Voir le document →</a>` : ''}
  <div class="exports">
    <a class="export-btn" href="${exportBaseUrl}/api/documents/${documentId}/export?format=json">JSON</a>
    <a class="export-btn" href="${exportBaseUrl}/api/documents/${documentId}/export?format=csv">CSV</a>
    <a class="export-btn" href="${exportBaseUrl}/api/documents/${documentId}/export?format=xml">XML</a>
    <a class="export-btn" href="${exportBaseUrl}/api/documents/${documentId}/export?format=xlsx">XLSX</a>
  </div>
  <div class="footer">Zafirix Pro · Document ${documentId.slice(0, 8)} · Généré par Documents IA</div>
</div>
</body></html>`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: SendEmailBody;
  try { body = await request.json() as SendEmailBody; } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { to, message = '', contentType = 'summary', shareToken } = body;
  if (!to?.trim()) return NextResponse.json({ error: 'recipient_required' }, { status: 400 });

  const admin = getSupabaseServiceRoleClient();

  const { data: doc, error: fetchErr } = await admin
    .from('atlas_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !doc) return NextResponse.json({ error: 'document_not_found' }, { status: 404 });

  const payload = buildDocumentExportPayload(doc as AtlasDocument);
  const ext = payload.extraction as Record<string, { value?: unknown; user_corrected_value?: string } | undefined>;
  function fv(key: string) {
    const f = ext[key];
    return f ? String(f.user_corrected_value ?? f.value ?? '') : '';
  }

  const shareLink = shareToken ? `${request.nextUrl.origin}/share/${shareToken}` : undefined;

  const html = buildEmailHtml({
    filename: doc.filename as string,
    documentType: payload.meta.document_type,
    supplierName: fv('supplier_name'),
    invoiceNumber: fv('invoice_number'),
    totalTtc: fv('total_ttc'),
    message,
    shareLink,
    exportBaseUrl: request.nextUrl.origin,
    documentId,
  });

  const subject = body.subject ?? `Document Zafirix Pro : ${doc.filename as string}`;

  const result = await sendEmailViaResend({ to: to.trim(), subject, html });

  if (!result.ok && 'skipped' in result && result.skipped) {
    // Email not configured — return mailto fallback data
    const mailtoSubject = encodeURIComponent(subject);
    const mailtoBody = encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint le document : ${doc.filename as string}\n\n${message}`);
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: 'email_not_configured',
      message: 'La configuration email (RESEND_API_KEY) n\'est pas active. Utilisez le lien mailto ci-dessous.',
      mailtoLink: `mailto:${to}?subject=${mailtoSubject}&body=${mailtoBody}`,
    });
  }

  if (!result.ok) {
    return NextResponse.json({ error: 'error' in result ? result.error : 'send_failed' }, { status: 500 });
  }

  // Audit
  void admin.from('atlas_entity_events').insert({
    user_id: userId,
    company_id: doc.company_id ?? null,
    entity_type: 'document',
    entity_id: documentId,
    event_type: 'sent_email',
    payload: { to: to.trim(), content_type: contentType, has_share_link: !!shareLink },
  });

  return NextResponse.json({ ok: true, emailId: 'id' in result ? result.id : undefined });
}

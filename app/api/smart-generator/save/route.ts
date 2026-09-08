/**
 * POST /api/smart-generator/save — persist chat-generated document to atlas_invoices.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { persistSmartGeneratorDocuments } from '@/app/lib/atlas-smart-generator';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import type { SmartGeneratorDocument } from '@/app/types/atlas-smart-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyId = String(body.companyId ?? body.company_id ?? '').trim();
  const structured = body.structured as SmartGeneratorDocument | undefined;
  const documentText = String(body.documentText ?? body.document ?? '').trim();

  if (!companyId) {
    return NextResponse.json(
      { error: 'company_required', message: 'Sélectionnez une société pour enregistrer le document.' },
      { status: 400 },
    );
  }

  if (!structured?.lines?.length && !documentText) {
    return NextResponse.json(
      { error: 'document_required', message: 'Aucun document à enregistrer.' },
      { status: 400 },
    );
  }

  const db = getSupabaseServiceRoleClient();

  if (structured?.lines?.length) {
    const docWithMeta: SmartGeneratorDocument = {
      ...structured,
      metadata: {
        ...structured.metadata,
        smart_generator_chat: true,
        document_text: documentText || undefined,
        saved_at: new Date().toISOString(),
      },
    };

    const saved = await persistSmartGeneratorDocuments(db, userId, companyId, [docWithMeta]);
    if (!saved.length) {
      return NextResponse.json({ error: 'save_failed', message: 'Échec enregistrement en base.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      id: saved[0]!.id,
      number: saved[0]!.number,
      message: `Document ${saved[0]!.number} enregistré dans la plateforme.`,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const fallbackDoc: SmartGeneratorDocument = {
    docType: 'autre',
    docTitle: String(body.documentTitle ?? 'DOCUMENT').trim() || 'DOCUMENT',
    number: `CHAT-${Date.now().toString(36).toUpperCase()}`,
    clientName: '—',
    issueDate: today,
    dueDate: today,
    lines: [{
      description: documentText.slice(0, 500) || 'Document conversationnel',
      quantity: 1,
      unit: 'Forfait',
      unitPriceHT: 0,
      vatRatePercent: 0,
      pcgeAccount: '7111',
      amountHT: 0,
      vatAmount: 0,
      totalTTC: 0,
    }],
    amountHT: 0,
    vatAmount: 0,
    totalTTC: 0,
    vatRatePercent: 0,
    status: 'draft',
    metadata: {
      smart_generator_chat: true,
      document_text: documentText,
      saved_at: new Date().toISOString(),
    },
  };

  const saved = await persistSmartGeneratorDocuments(db, userId, companyId, [fallbackDoc]);
  if (!saved.length) {
    return NextResponse.json({ error: 'save_failed', message: 'Échec enregistrement en base.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: saved[0]!.id,
    number: saved[0]!.number,
    message: `Document enregistré (réf. ${saved[0]!.number}).`,
  });
}

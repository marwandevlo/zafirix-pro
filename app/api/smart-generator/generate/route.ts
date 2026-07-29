/**
 * POST /api/smart-generator/generate
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { checkAiEndpointRateLimit, checkWorkspaceRateLimit, rateLimitResponse } from '@/app/lib/atlas-rate-limit';
import { meterFeatureUsage } from '@/app/lib/atlas-usage-meter';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';
import { runSmartGenerator } from '@/app/lib/atlas-smart-generator';
import {
  generateSmartGeneratorExcelBuffer,
  generateSmartGeneratorPdfBuffer,
  smartGeneratorExportBasename,
} from '@/app/lib/atlas-smart-generator-export';
import type { SmartGeneratorDocType, SmartGeneratorParams } from '@/app/types/atlas-smart-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_DOC_TYPES = new Set<SmartGeneratorDocType>(['facture', 'devis', 'bon_commande']);

function parseParams(body: Record<string, unknown>): SmartGeneratorParams | null {
  const dateDebut = String(body.date_debut ?? body.dateDebut ?? '').slice(0, 10);
  const dateFin = String(body.date_fin ?? body.dateFin ?? '').slice(0, 10);
  const numeroDebut = Number(body.numero_debut ?? body.numeroDebut ?? 1);
  const numeroFin = Number(body.numero_fin ?? body.numeroFin ?? 10);
  const montantMaxParDocument = Number(body.montant_max_par_document ?? body.montantMaxParDocument ?? 0);

  if (!dateDebut || !dateFin) return null;
  if (!Number.isFinite(numeroDebut) || !Number.isFinite(numeroFin) || numeroFin < numeroDebut) return null;

  return {
    dateDebut,
    dateFin,
    numeroDebut: Math.max(1, Math.floor(numeroDebut)),
    numeroFin: Math.max(Math.floor(numeroDebut), Math.floor(numeroFin)),
    montantMaxParDocument: Math.max(0, montantMaxParDocument),
  };
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const rate = checkAiEndpointRateLimit(`smart-generator:${userId}`);
  if (!rate.ok) {
    const rl = rateLimitResponse(rate);
    return NextResponse.json(rl.body, { status: rl.status });
  }

  const db = getSupabaseServiceRoleClient();
  const { workspaceId } = await ensureWorkspaceSubscription(db, userId);
  const wsRate = checkWorkspaceRateLimit(workspaceId, 'ai_chat', userId);
  if (!wsRate.ok) {
    const rl = rateLimitResponse(wsRate);
    return NextResponse.json(rl.body, { status: rl.status });
  }

  const meter = await meterFeatureUsage(db, userId, 'ai_request');
  if (!meter.ok) {
    return NextResponse.json({ error: meter.code, message: meter.messageFr }, { status: meter.status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const prompt = String(body.prompt ?? '').trim();
  const companyId = String(body.companyId ?? '').trim();
  const docType = String(body.docType ?? body.documentType ?? 'facture') as SmartGeneratorDocType;
  const language = String(body.language ?? 'fr') as 'fr' | 'ar' | 'darija';

  if (!prompt) return NextResponse.json({ error: 'prompt_required' }, { status: 400 });
  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });
  if (!VALID_DOC_TYPES.has(docType)) return NextResponse.json({ error: 'invalid_doc_type' }, { status: 400 });

  const params = parseParams(body);
  if (!params) {
    return NextResponse.json({ error: 'invalid_params', message: 'Paramètres de génération invalides.' }, { status: 400 });
  }

  try {
    const result = await runSmartGenerator(db, userId, {
      companyId,
      prompt,
      docType,
      params,
      language,
    });

    if (!result.documents.length) {
      return NextResponse.json({ error: 'no_documents_generated' }, { status: 422 });
    }

    const company = result.company ?? {};
    const [pdfBuffer, excelBuffer] = await Promise.all([
      generateSmartGeneratorPdfBuffer(result.documents, company, docType),
      generateSmartGeneratorExcelBuffer(result.documents, company, params, docType),
    ]);

    const baseName = smartGeneratorExportBasename(company, docType);

    return NextResponse.json({
      ok: true,
      documents: result.documents.map((d) => ({
        id: d.id,
        number: d.number,
        clientName: d.clientName,
        issueDate: d.issueDate,
        amountHT: d.amountHT,
        vatAmount: d.vatAmount,
        totalTTC: d.totalTTC,
        lineCount: d.lines.length,
      })),
      summary: result.summary,
      provider: result.provider,
      exports: {
        pdfFilename: `${baseName}.pdf`,
        excelFilename: `${baseName}.xlsx`,
        pdfBase64: pdfBuffer.toString('base64'),
        excelBase64: excelBuffer.toString('base64'),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generation_failed';
    const status = message === 'company_not_found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

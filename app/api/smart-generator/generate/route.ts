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
import type {
  SmartGeneratorDocType,
  SmartGeneratorHeader,
  SmartGeneratorItemSpec,
  SmartGeneratorParams,
  SmartGeneratorBrandingAssets,
} from '@/app/types/atlas-smart-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_DOC_TYPES = new Set<SmartGeneratorDocType>(['facture', 'devis', 'bon_commande', 'autre']);

function parseParams(body: Record<string, unknown>): SmartGeneratorParams | null {
  const dateDebut = String(body.date_debut ?? body.dateDebut ?? '').slice(0, 10);
  const dateFin = String(body.date_fin ?? body.dateFin ?? '').slice(0, 10);
  const numeroDebut = Number(body.numero_debut ?? body.numeroDebut ?? 1);
  const numeroFin = Number(body.numero_fin ?? body.numeroFin ?? 10);
  const montantMaxParDocument = Number(body.montant_max_par_document ?? body.montantMaxParDocument ?? 0);
  const documentCountRaw = body.document_count ?? body.documentCount ?? body.nombre_documents;
  const documentCount = documentCountRaw != null && documentCountRaw !== ''
    ? Math.max(1, Math.floor(Number(documentCountRaw)))
    : undefined;
  const defaultClientName = String(body.default_client_name ?? body.defaultClientName ?? '').trim() || undefined;

  if (!dateDebut || !dateFin) return null;
  if (!Number.isFinite(numeroDebut) || !Number.isFinite(numeroFin) || numeroFin < numeroDebut) return null;

  return {
    dateDebut,
    dateFin,
    numeroDebut: Math.max(1, Math.floor(numeroDebut)),
    numeroFin: Math.max(Math.floor(numeroDebut), Math.floor(numeroFin)),
    montantMaxParDocument: Math.max(0, montantMaxParDocument),
    documentCount,
    defaultClientName,
  };
}

function parseCustomHeader(body: Record<string, unknown>): SmartGeneratorHeader | null {
  const h = (body.customHeader ?? body.custom_header) as Record<string, unknown> | undefined;
  if (!h || typeof h !== 'object') return null;
  return {
    raisonSociale: String(h.raisonSociale ?? h.raison_sociale ?? h.companyName ?? '').trim() || undefined,
    ice: String(h.ice ?? '').trim() || undefined,
    if_fiscal: String(h.if_fiscal ?? h.ifFiscal ?? '').trim() || undefined,
    rc: String(h.rc ?? '').trim() || undefined,
    adresse: String(h.adresse ?? h.address ?? '').trim() || undefined,
    ville: String(h.ville ?? h.city ?? '').trim() || undefined,
    patent: String(h.patent ?? h.patente ?? h.taxeProfessionnelle ?? '').trim() || undefined,
    cnss: String(h.cnss ?? '').trim() || undefined,
    capitalSocial: String(h.capitalSocial ?? h.capital_social ?? '').trim() || undefined,
    telephone: String(h.telephone ?? h.tel ?? '').trim() || undefined,
    fax: String(h.fax ?? '').trim() || undefined,
    email: String(h.email ?? '').trim() || undefined,
    logoUrl: String(h.logoUrl ?? h.logo_url ?? '').trim() || undefined,
    logoBase64: String(h.logoBase64 ?? h.logo_base64 ?? '').trim() || undefined,
    logoMimeType: String(h.logoMimeType ?? h.logo_mime_type ?? '').trim() || undefined,
    headerPdfBase64: String(h.headerPdfBase64 ?? h.header_pdf_base64 ?? '').trim() || undefined,
  };
}

function parseBrandingAssets(body: Record<string, unknown>, header: SmartGeneratorHeader | null): SmartGeneratorBrandingAssets | null {
  const b = (body.brandingAssets ?? body.branding_assets) as Record<string, unknown> | undefined;
  const logoBase64 = String(b?.logoBase64 ?? b?.logo_base64 ?? header?.logoBase64 ?? '').trim() || undefined;
  const logoMimeType = String(b?.logoMimeType ?? b?.logo_mime_type ?? header?.logoMimeType ?? '').trim() || undefined;
  const headerPdfBase64 = String(b?.headerPdfBase64 ?? b?.header_pdf_base64 ?? header?.headerPdfBase64 ?? '').trim() || undefined;
  if (!logoBase64 && !headerPdfBase64) return null;
  return { logoBase64, logoMimeType, headerPdfBase64 };
}

function parseItemSpecs(body: Record<string, unknown>): SmartGeneratorItemSpec[] {
  const raw = body.itemSpecs ?? body.item_specs ?? body.items;
  if (!Array.isArray(raw)) return [];
  const out: SmartGeneratorItemSpec[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const designation = String(r.designation ?? r.description ?? '').trim();
    if (!designation) continue;
    out.push({
      reference: String(r.reference ?? r.code ?? r.ref ?? '').trim() || undefined,
      category: String(r.category ?? r.type ?? r.type_marchandise ?? '').trim() || undefined,
      designation,
      quantity: Math.max(0.001, Number(r.quantity ?? r.quantite ?? 1)),
      unit: String(r.unit ?? r.unite ?? 'Pcs').trim() || 'Pcs',
      unitPriceHT: r.unitPriceHT != null ? Number(r.unitPriceHT) : r.prix_unitaire != null ? Number(r.prix_unitaire) : undefined,
      unitPriceMin: r.unitPriceMin != null ? Number(r.unitPriceMin) : r.prix_min != null ? Number(r.prix_min) : undefined,
      unitPriceMax: r.unitPriceMax != null ? Number(r.unitPriceMax) : r.prix_max != null ? Number(r.prix_max) : undefined,
      vatRatePercent: r.vatRatePercent != null ? Number(r.vatRatePercent) : r.taux_tva != null ? Number(r.taux_tva) : undefined,
      pcgeAccount: String(r.pcgeAccount ?? r.compte ?? '').trim() || undefined,
    });
  }
  return out;
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
  const companyId = String(body.companyId ?? body.company_id ?? '').trim() || null;
  const docType = String(body.docType ?? body.documentType ?? 'facture') as SmartGeneratorDocType;
  const customDocTitle = String(body.customDocTitle ?? body.custom_doc_title ?? '').trim() || undefined;
  const language = String(body.language ?? 'fr') as 'fr' | 'ar' | 'darija';
  const persistToDb = body.persistToDb !== false && body.persist_to_db !== false;
  const itemSpecs = parseItemSpecs(body);
  const customHeader = parseCustomHeader(body);
  const brandingAssets = parseBrandingAssets(body, customHeader);

  if (!VALID_DOC_TYPES.has(docType)) {
    return NextResponse.json({ error: 'invalid_doc_type' }, { status: 400 });
  }
  if (docType === 'autre' && !customDocTitle) {
    return NextResponse.json(
      { error: 'custom_title_required', message: 'Indiquez un titre pour le type Autre.' },
      { status: 400 },
    );
  }

  const params = parseParams(body);
  if (!params) {
    return NextResponse.json({ error: 'invalid_params', message: 'Paramètres de génération invalides.' }, { status: 400 });
  }

  if (!prompt && !itemSpecs.length) {
    return NextResponse.json(
      { error: 'prompt_or_items_required', message: 'Saisissez une consigne ou au moins une ligne d\'article.' },
      { status: 400 },
    );
  }

  try {
    const result = await runSmartGenerator(db, userId, {
      companyId,
      customHeader,
      prompt,
      docType,
      customDocTitle,
      params,
      itemSpecs,
      language,
      persistToDb: persistToDb && Boolean(companyId),
    });

    if (!result.documents.length) {
      return NextResponse.json({ error: 'no_documents_generated' }, { status: 422 });
    }

    const company = result.company ?? {};
    const docTitle = result.documents[0]?.docTitle ?? 'DOCUMENT';
    const [pdfBuffer, excelBuffer] = await Promise.all([
      generateSmartGeneratorPdfBuffer(result.documents, company, brandingAssets),
      generateSmartGeneratorExcelBuffer(result.documents, company, params),
    ]);

    const baseName = smartGeneratorExportBasename(company, docTitle);

    return NextResponse.json({
      ok: true,
      persisted: result.persisted,
      documents: result.documents.map((d) => ({
        id: d.id,
        number: d.number,
        docTitle: d.docTitle,
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
    const status =
      message === 'company_not_found' ? 404 :
      message === 'prompt_or_items_required' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

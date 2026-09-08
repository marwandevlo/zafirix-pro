/**
 * POST /api/smart-generator/export — PDF or Excel from structured chat document.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import {
  generateSmartGeneratorExcelBuffer,
  generateSmartGeneratorPdfBuffer,
  smartGeneratorExportBasename,
} from '@/app/lib/atlas-smart-generator-export';
import {
  loadCompanyForSmartGenerator,
  mergeCompanyHeader,
} from '@/app/lib/atlas-smart-generator';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import type { SmartGeneratorBrandingAssets, SmartGeneratorDocument, SmartGeneratorHeader } from '@/app/types/atlas-smart-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseHeader(raw: unknown): SmartGeneratorHeader | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  return {
    raisonSociale: String(h.raisonSociale ?? h.raison_sociale ?? '').trim() || undefined,
    ice: String(h.ice ?? '').trim() || undefined,
    if_fiscal: String(h.if_fiscal ?? '').trim() || undefined,
    rc: String(h.rc ?? '').trim() || undefined,
    patent: String(h.patent ?? '').trim() || undefined,
    cnss: String(h.cnss ?? '').trim() || undefined,
    adresse: String(h.adresse ?? '').trim() || undefined,
    ville: String(h.ville ?? '').trim() || undefined,
    telephone: String(h.telephone ?? '').trim() || undefined,
    email: String(h.email ?? '').trim() || undefined,
    logoBase64: String(h.logoBase64 ?? '').trim() || undefined,
    logoMimeType: String(h.logoMimeType ?? '').trim() || undefined,
    headerPdfBase64: String(h.headerPdfBase64 ?? '').trim() || undefined,
  };
}

function parseBranding(raw: unknown): SmartGeneratorBrandingAssets | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const logoBase64 = String(b.logoBase64 ?? '').trim() || undefined;
  const headerPdfBase64 = String(b.headerPdfBase64 ?? '').trim() || undefined;
  if (!logoBase64 && !headerPdfBase64) return null;
  return {
    logoBase64,
    logoMimeType: String(b.logoMimeType ?? '').trim() || undefined,
    headerPdfBase64,
  };
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const format = String(body.format ?? 'pdf').toLowerCase();
  const structured = body.structured as SmartGeneratorDocument | undefined;
  const companyId = String(body.companyId ?? body.company_id ?? '').trim() || null;
  const customHeader = parseHeader(body.companyHeader ?? body.customHeader);
  const branding = parseBranding(body.brandingAssets ?? body.branding);

  if (!structured?.lines?.length) {
    return NextResponse.json(
      { error: 'structured_required', message: 'Document structuré requis pour l\'export PDF/Excel.' },
      { status: 400 },
    );
  }

  const db = getSupabaseServiceRoleClient();
  let dbCompany = null;
  if (companyId) {
    dbCompany = await loadCompanyForSmartGenerator(db, companyId, userId);
  }
  const company = mergeCompanyHeader(dbCompany, customHeader);
  const documents = [structured];
  const baseName = smartGeneratorExportBasename(company, structured.docTitle ?? 'DOCUMENT');

  try {
    if (format === 'excel' || format === 'xlsx') {
      const excelBuffer = await generateSmartGeneratorExcelBuffer(documents, company, {
        dateDebut: structured.issueDate,
        dateFin: structured.issueDate,
        numeroDebut: 1,
        numeroFin: 1,
        montantMaxParDocument: 0,
      });
      return NextResponse.json({
        ok: true,
        filename: `${baseName}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: excelBuffer.toString('base64'),
      });
    }

    const pdfBuffer = await generateSmartGeneratorPdfBuffer(documents, company, branding);
    return NextResponse.json({
      ok: true,
      filename: `${baseName}.pdf`,
      mimeType: 'application/pdf',
      base64: pdfBuffer.toString('base64'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

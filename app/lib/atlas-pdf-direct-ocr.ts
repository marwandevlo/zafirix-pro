/**
 * Direct PDF OCR via Anthropic document blocks — no local rendering required.
 *
 * Eliminates the pdfjs-dist / @napi-rs/canvas dependency for PDF processing,
 * removing the source of pdf_render_failed on Vercel serverless functions.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AtlasOcrDetectedInvoice, AtlasOcrExtraction } from '@/app/types/atlas-document';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';

const PDF_OCR_SYSTEM = `Tu es un expert en extraction de données de factures marocaines.
Analyse le document PDF fourni et extrais TOUTES les factures présentes.

Retourne un JSON valide avec cette structure exacte :
{
  "total_pages": <nombre de pages détectées>,
  "invoices": [
    {
      "page_number": <numéro de page>,
      "source_pages": [<pages sources>],
      "numero_facture": "...",
      "date": "jj/mm/aaaa",
      "fournisseur": "...",
      "montant_ht": 0.00,
      "taux_tva": 20,
      "montant_tva": 0.00,
      "montant_ttc": 0.00,
      "description": "..."
    }
  ]
}

Règles :
- Si plusieurs factures sont présentes, liste-les toutes.
- Si aucune facture n'est trouvée, retourne invoices: [].
- Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.
- Les montants doivent être des nombres (float), pas des chaînes.`;

export type DirectPdfOcrSuccess = {
  ok: true;
  totalPages: number;
  invoices: AtlasOcrDetectedInvoice[];
  merged: AtlasOcrExtraction;
  extractedText: string;
};

export type DirectPdfOcrFailure = {
  ok: false;
  code: string;
  step: string;
  message: string;
  rawError?: string;
};

export type DirectPdfOcrResult = DirectPdfOcrSuccess | DirectPdfOcrFailure;

type RawInvoice = {
  page_number?: number;
  source_pages?: number[];
  numero_facture?: string;
  date?: string;
  fournisseur?: string;
  montant_ht?: number;
  taux_tva?: number;
  montant_tva?: number;
  montant_ttc?: number;
  description?: string;
};

type RawPdfResponse = {
  total_pages?: number;
  invoices?: RawInvoice[];
};

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    if (isFinite(n)) return n;
  }
  return undefined;
}

function parseRawResponse(text: string): RawPdfResponse {
  const clean = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(clean) as RawPdfResponse;
}

function buildInvoices(raw: RawPdfResponse): AtlasOcrDetectedInvoice[] {
  if (!Array.isArray(raw.invoices) || !raw.invoices.length) return [];
  return raw.invoices.map((inv, idx): AtlasOcrDetectedInvoice => ({
    page_number: typeof inv.page_number === 'number' ? inv.page_number : idx + 1,
    source_pages: Array.isArray(inv.source_pages) ? inv.source_pages : [typeof inv.page_number === 'number' ? inv.page_number : idx + 1],
    invoice_number: inv.numero_facture ?? undefined,
    supplier_name: inv.fournisseur ?? undefined,
    invoice_date: inv.date ?? undefined,
    amount_ht: toNumber(inv.montant_ht),
    vat_amount: toNumber(inv.montant_tva),
    amount_ttc: toNumber(inv.montant_ttc),
    vat_rate: toNumber(inv.taux_tva),
    status: 'detected',
  }));
}

function buildMerged(invoices: AtlasOcrDetectedInvoice[]): AtlasOcrExtraction {
  if (!invoices.length) return {};
  // Pick the invoice with the highest TTC as the "summary"
  const best = invoices.reduce((a, b) => ((a.amount_ttc ?? 0) >= (b.amount_ttc ?? 0) ? a : b));
  return {
    numero_facture: best.invoice_number,
    fournisseur: best.supplier_name,
    date: best.invoice_date,
    montant_ht: best.amount_ht,
    taux_tva: best.vat_rate,
    montant_tva: best.vat_amount,
    montant_ttc: best.amount_ttc,
    description: invoices.map((i) => i.invoice_number).filter(Boolean).join(' | ') || undefined,
  };
}

/** Send a PDF buffer directly to Anthropic — no local rendering needed. */
export async function runDirectPdfOcrExtraction(
  pdfBuffer: Buffer,
  fileName?: string | null,
): Promise<DirectPdfOcrResult> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return { ok: false, code: 'ocr_not_configured', step: 'auth', message: 'ANTHROPIC_API_KEY missing' };
  }

  // Enforce Anthropic 32 MB limit
  if (pdfBuffer.length > 32 * 1024 * 1024) {
    return { ok: false, code: 'pdf_too_large', step: 'validate', message: 'PDF exceeds 32 MB limit' };
  }

  const pdfBase64 = pdfBuffer.toString('base64');

  try {
    const client = new Anthropic({ apiKey });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docBlock: any = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    };

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: PDF_OCR_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            docBlock,
            {
              type: 'text',
              text: `Extrais toutes les factures de ce document${fileName ? ` (${fileName})` : ''} en JSON.`,
            },
          ],
        },
      ],
    } as Parameters<typeof client.messages.create>[0]) as Awaited<ReturnType<typeof client.messages.create>>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (response as any).content as Array<{ type: string; text?: string }> | undefined;
    const rawText = content?.[0]?.type === 'text' ? (content[0].text ?? '') : '';
    if (!rawText.trim()) {
      return { ok: false, code: 'empty_response', step: 'ai_provider', message: 'Empty response from AI' };
    }

    let parsed: RawPdfResponse;
    try {
      parsed = parseRawResponse(rawText);
    } catch (e) {
      return {
        ok: false,
        code: 'json_parse_failed',
        step: 'json_parse',
        message: e instanceof Error ? e.message : 'JSON parse failed',
        rawError: rawText.slice(0, 500),
      };
    }

    const invoices = buildInvoices(parsed);
    const merged = buildMerged(invoices);
    const totalPages = typeof parsed.total_pages === 'number' && parsed.total_pages > 0
      ? parsed.total_pages
      : Math.max(1, ...invoices.map((i) => i.page_number));

    return {
      ok: true,
      totalPages,
      invoices,
      merged,
      extractedText: rawText,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = message.includes('overloaded') ? 'ai_provider_overloaded'
      : message.includes('timeout') ? 'ocr_timeout'
      : 'ai_provider_error';
    return { ok: false, code, step: 'ai_provider', message, rawError: message };
  }
}

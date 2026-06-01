/**
 * Direct PDF OCR via Anthropic document blocks — classification + structured extraction.
 *
 * Sends the PDF natively to Claude, which returns:
 *  - document classification (type, confidence, reason)
 *  - structured field extraction with confidence scores per field
 *  - legacy invoice list for backward compatibility
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AtlasDocumentClassification,
  AtlasDocumentType,
  AtlasExtractedField,
  AtlasInvoiceLineItem,
  AtlasOcrDetectedInvoice,
  AtlasOcrExtraction,
  AtlasStructuredExtraction,
} from '@/app/types/atlas-document';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';

const PDF_OCR_SYSTEM = `Tu es un expert en analyse de documents financiers marocains (factures, relevés bancaires, bulletins de paie, contrats, déclarations fiscales).

Analyse le document PDF fourni et retourne un JSON valide avec cette structure EXACTE :

{
  "classification": {
    "detected_type": "<type>",
    "type_confidence": 0.00,
    "classification_reason": "<explication courte>",
    "possible_types": ["<type1>", "<type2>"],
    "detected_language": "<fr|ar|en>",
    "detected_country": "<MA|FR|...>",
    "detected_currency": "<MAD|EUR|USD|...>"
  },
  "total_pages": <entier>,
  "extraction": {
    "supplier_name": { "value": "...", "confidence": 0.00, "source_page": 1, "raw_value": "..." },
    "supplier_ice": { "value": "...", "confidence": 0.00, "source_page": 1 },
    "supplier_if": { "value": "...", "confidence": 0.00, "source_page": 1 },
    "supplier_rc": { "value": "...", "confidence": 0.00, "source_page": 1 },
    "supplier_address": { "value": "...", "confidence": 0.00, "source_page": 1 },
    "customer_name": { "value": "...", "confidence": 0.00, "source_page": 1 },
    "customer_ice": { "value": "...", "confidence": 0.00, "source_page": 1 },
    "invoice_number": { "value": "...", "confidence": 0.00, "source_page": 1, "raw_value": "..." },
    "invoice_date": { "value": "jj/mm/aaaa", "confidence": 0.00, "source_page": 1 },
    "due_date": { "value": "jj/mm/aaaa ou null", "confidence": 0.00, "source_page": 1 },
    "currency": { "value": "MAD", "confidence": 0.00, "source_page": 1 },
    "subtotal_ht": { "value": 0.00, "confidence": 0.00, "source_page": 1, "raw_value": "..." },
    "tva_rate": { "value": 20, "confidence": 0.00, "source_page": 1 },
    "tva_amount": { "value": 0.00, "confidence": 0.00, "source_page": 1, "raw_value": "..." },
    "total_ttc": { "value": 0.00, "confidence": 0.00, "source_page": 1, "raw_value": "..." },
    "payment_method": { "value": "...", "confidence": 0.00, "source_page": 1 },
    "category_suggestion": { "value": "...", "confidence": 0.00, "source_page": 1 },
    "accounting_account": { "value": "...", "confidence": 0.00, "source_page": 1 },
    "is_purchase": { "value": true, "confidence": 0.00, "source_page": 1 }
  },
  "line_items": [
    { "description": "...", "quantity": 1, "unit_price": 0.00, "total_ht": 0.00, "tva_rate": 20 }
  ],
  "invoices": [
    {
      "page_number": 1,
      "source_pages": [1],
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

Types de documents acceptés pour detected_type :
purchase_invoice, sales_invoice, receipt, bank_statement, payroll_slip,
cnss_document, tax_declaration, vat_declaration, legal_contract,
company_statutes, legal_notice, hr_document, accounting_document, unknown

Règles strictes :
- confidence est entre 0.00 et 1.00
- Si un champ est absent du document, mettre value: null et confidence: 0.00
- Les montants sont des nombres (float), jamais des chaînes
- Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire ni markdown
- Si plusieurs factures sont présentes, liste-les toutes dans invoices[]
- Pour les relevés bancaires, ignorer les champs facture et extraire les soldes`;

// ── Public types ──────────────────────────────────────────────────────────────

export type DirectPdfOcrSuccess = {
  ok: true;
  totalPages: number;
  classification: AtlasDocumentClassification;
  extraction: AtlasStructuredExtraction;
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

// ── Raw response types ────────────────────────────────────────────────────────

type RawField = {
  value?: unknown;
  confidence?: unknown;
  source_page?: unknown;
  raw_value?: unknown;
};

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

type RawClassification = {
  detected_type?: string;
  type_confidence?: number;
  classification_reason?: string;
  possible_types?: string[];
  detected_language?: string;
  detected_country?: string;
  detected_currency?: string;
};

type RawLineItem = {
  description?: string;
  quantity?: number;
  unit_price?: number;
  total_ht?: number;
  tva_rate?: number;
};

type RawPdfResponse = {
  total_pages?: number;
  classification?: RawClassification;
  extraction?: Record<string, RawField>;
  line_items?: RawLineItem[];
  invoices?: RawInvoice[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_DOC_TYPES = new Set<string>([
  'purchase_invoice','sales_invoice','receipt','bank_statement','payroll_slip',
  'cnss_document','tax_declaration','vat_declaration','legal_contract',
  'company_statutes','legal_notice','hr_document','accounting_document','unknown',
]);

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    if (isFinite(n)) return n;
  }
  return undefined;
}

function toConfidence(v: unknown): number {
  const n = toNumber(v);
  if (n == null) return 0;
  return Math.min(1, Math.max(0, n));
}

function parseRawResponse(text: string): RawPdfResponse {
  const clean = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(clean) as RawPdfResponse;
}

function buildClassification(raw?: RawClassification): AtlasDocumentClassification {
  const type = (raw?.detected_type ?? 'unknown') as string;
  return {
    detected_type: (VALID_DOC_TYPES.has(type) ? type : 'unknown') as AtlasDocumentType,
    type_confidence: toConfidence(raw?.type_confidence),
    classification_reason: String(raw?.classification_reason ?? ''),
    possible_types: (Array.isArray(raw?.possible_types) ? raw!.possible_types : [])
      .filter(t => VALID_DOC_TYPES.has(t)) as AtlasDocumentType[],
    detected_language: String(raw?.detected_language ?? 'fr'),
    detected_country: String(raw?.detected_country ?? 'MA'),
    detected_currency: String(raw?.detected_currency ?? 'MAD'),
  };
}

function buildField(raw?: RawField): AtlasExtractedField | undefined {
  if (!raw) return undefined;
  return {
    value: raw.value !== undefined ? (raw.value as string | number | null) : null,
    confidence: toConfidence(raw.confidence),
    source_page: typeof raw.source_page === 'number' ? raw.source_page : undefined,
    raw_value: typeof raw.raw_value === 'string' ? raw.raw_value : undefined,
    normalized_value: undefined,
    user_verified: false,
  };
}

function buildExtraction(rawExt?: Record<string, RawField>): AtlasStructuredExtraction {
  if (!rawExt) return {};
  const f = (key: string) => buildField(rawExt[key]);
  return {
    supplier_name: f('supplier_name'),
    supplier_ice: f('supplier_ice'),
    supplier_if: f('supplier_if'),
    supplier_rc: f('supplier_rc'),
    supplier_address: f('supplier_address'),
    customer_name: f('customer_name'),
    customer_ice: f('customer_ice'),
    invoice_number: f('invoice_number'),
    invoice_date: f('invoice_date'),
    due_date: f('due_date'),
    currency: f('currency'),
    subtotal_ht: f('subtotal_ht'),
    tva_rate: f('tva_rate'),
    tva_amount: f('tva_amount'),
    total_ttc: f('total_ttc'),
    payment_method: f('payment_method'),
    category_suggestion: f('category_suggestion'),
    accounting_account: f('accounting_account'),
    is_purchase: f('is_purchase'),
    bank_name: f('bank_name'),
    account_number: f('account_number'),
    statement_period: f('statement_period'),
    opening_balance: f('opening_balance'),
    closing_balance: f('closing_balance'),
    employee_name: f('employee_name'),
    period: f('period'),
    gross_salary: f('gross_salary'),
    net_salary: f('net_salary'),
    cnss_amount: f('cnss_amount'),
    ir_amount: f('ir_amount'),
  };
}

function buildLineItems(raw?: RawLineItem[]): AtlasInvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => ({
    description: String(item.description ?? ''),
    quantity: toNumber(item.quantity),
    unit_price: toNumber(item.unit_price),
    total_ht: toNumber(item.total_ht),
    tva_rate: toNumber(item.tva_rate),
  }));
}

function buildInvoices(raw: RawPdfResponse): AtlasOcrDetectedInvoice[] {
  if (!Array.isArray(raw.invoices) || !raw.invoices.length) return [];
  return raw.invoices.map((inv, idx): AtlasOcrDetectedInvoice => ({
    page_number: typeof inv.page_number === 'number' ? inv.page_number : idx + 1,
    source_pages: Array.isArray(inv.source_pages)
      ? inv.source_pages
      : [typeof inv.page_number === 'number' ? inv.page_number : idx + 1],
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

function buildMerged(invoices: AtlasOcrDetectedInvoice[], extraction: AtlasStructuredExtraction): AtlasOcrExtraction {
  const val = (f?: { value?: string | number | null }) =>
    f?.value != null ? f.value : undefined;
  const num = (f?: { value?: string | number | null }): number | undefined => {
    const v = val(f);
    return v != null ? toNumber(v) : undefined;
  };

  if (extraction.invoice_number || extraction.supplier_name || extraction.total_ttc) {
    return {
      numero_facture: val(extraction.invoice_number) as string | undefined,
      fournisseur: val(extraction.supplier_name) as string | undefined,
      date: val(extraction.invoice_date) as string | undefined,
      montant_ht: num(extraction.subtotal_ht),
      taux_tva: num(extraction.tva_rate),
      montant_tva: num(extraction.tva_amount),
      montant_ttc: num(extraction.total_ttc),
      description: val(extraction.category_suggestion) as string | undefined,
    };
  }

  if (!invoices.length) return {};
  const best = invoices.reduce((a, b) => ((a.amount_ttc ?? 0) >= (b.amount_ttc ?? 0) ? a : b));
  return {
    numero_facture: best.invoice_number,
    fournisseur: best.supplier_name,
    date: best.invoice_date,
    montant_ht: best.amount_ht,
    taux_tva: best.vat_rate,
    montant_tva: best.vat_amount,
    montant_ttc: best.amount_ttc,
    description: invoices.map(i => i.invoice_number).filter(Boolean).join(' | ') || undefined,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Send a PDF buffer directly to Anthropic — no local rendering needed. */
export async function runDirectPdfOcrExtraction(
  pdfBuffer: Buffer,
  fileName?: string | null,
): Promise<DirectPdfOcrResult> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return { ok: false, code: 'ocr_not_configured', step: 'auth', message: 'ANTHROPIC_API_KEY missing' };
  }

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
      max_tokens: 8192,
      system: PDF_OCR_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            docBlock,
            {
              type: 'text',
              text: `Analyse ce document${fileName ? ` (${fileName})` : ''} et retourne le JSON complet demandé.`,
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

    const classification = buildClassification(parsed.classification);
    const extraction = buildExtraction(parsed.extraction);
    const lineItems = buildLineItems(parsed.line_items);
    const invoices = buildInvoices(parsed);
    const merged = buildMerged(invoices, extraction);
    const totalPages = typeof parsed.total_pages === 'number' && parsed.total_pages > 0
      ? parsed.total_pages
      : Math.max(1, ...invoices.map(i => i.page_number), 1);

    // Attach line items to extraction for persistence
    extraction.line_items = lineItems;

    return {
      ok: true,
      totalPages,
      classification,
      extraction,
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

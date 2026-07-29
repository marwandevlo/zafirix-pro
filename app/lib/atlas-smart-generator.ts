/**
 * Smart Generator — LLM parsing, DGI calculations, document splitting, DB persistence.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { runAtlasAiWithFallback } from '@/app/lib/atlas-ai-provider';
import {
  isValidMoroccoVatRate,
  isValidPcgeAccount,
  MOROCCO_TVA_RATES,
} from '@/app/lib/atlas-morocco-compliance';
import { formatDgiVatRate, roundDgiAmount } from '@/app/lib/atlas-tva-dgi';
import type { AtlasCompany } from '@/app/types/atlas-company';
import type {
  SmartGeneratorDocType,
  SmartGeneratorDocument,
  SmartGeneratorGenerateRequest,
  SmartGeneratorLineItem,
  SmartGeneratorParams,
  SmartGeneratorResult,
} from '@/app/types/atlas-smart-generator';

const GENERATOR_SYSTEM = `Tu es le moteur Smart Generator de Zafirix Atlas (Maroc).
Tu convertis une consigne en langage naturel (français, arabe ou darija) en données structurées pour documents commerciaux.

Règles DGI Maroc:
- Taux TVA autorisés: 0%, 7%, 10%, 14%, 20% uniquement.
- Comptes PCGE: 3 à 8 chiffres (ex: 6111, 7121).
- Montants en MAD, 2 décimales.

Réponds UNIQUEMENT avec un JSON valide (sans markdown):
{
  "documents": [
    {
      "clientName": "Nom client ou fournisseur",
      "issueDate": "YYYY-MM-DD",
      "lines": [
        {
          "description": "Libellé article ou prestation",
          "quantity": 1,
          "unitPriceHT": 1000,
          "vatRatePercent": 20,
          "pcgeAccount": "7111"
        }
      ]
    }
  ]
}`;

type RawLlmLine = {
  description?: string;
  quantity?: number;
  unitPriceHT?: number;
  vatRatePercent?: number;
  pcgeAccount?: string;
};

type RawLlmDoc = {
  clientName?: string;
  issueDate?: string;
  lines?: RawLlmLine[];
};

type RawLlmPayload = {
  documents?: RawLlmDoc[];
};

function nearestMoroccoVatRate(pct: number): number {
  const normalized = formatDgiVatRate(pct);
  if (isValidMoroccoVatRate(normalized)) return normalized;
  let best: number = MOROCCO_TVA_RATES[0];
  let bestDiff = Infinity;
  for (const r of MOROCCO_TVA_RATES) {
    const diff = Math.abs(r - normalized);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

export function computeLineItem(raw: RawLlmLine): SmartGeneratorLineItem {
  const quantity = Math.max(0.001, Number(raw.quantity ?? 1));
  const unitPriceHT = roundDgiAmount(Number(raw.unitPriceHT ?? 0));
  const vatRatePercent = nearestMoroccoVatRate(Number(raw.vatRatePercent ?? 20));
  const amountHT = roundDgiAmount(quantity * unitPriceHT);
  const vatAmount = roundDgiAmount(amountHT * (vatRatePercent / 100));
  const totalTTC = roundDgiAmount(amountHT + vatAmount);
  const pcge = raw.pcgeAccount ? String(raw.pcgeAccount).replace(/\D/g, '').slice(0, 8) : undefined;

  return {
    description: String(raw.description ?? 'Prestation').trim() || 'Prestation',
    quantity,
    unitPriceHT,
    vatRatePercent,
    pcgeAccount: pcge && isValidPcgeAccount(pcge) ? pcge : '7111',
    amountHT,
    vatAmount,
    totalTTC,
  };
}

function aggregateDocument(
  docType: SmartGeneratorDocType,
  number: string,
  clientName: string,
  issueDate: string,
  lines: SmartGeneratorLineItem[],
  params: SmartGeneratorParams,
): SmartGeneratorDocument {
  const amountHT = roundDgiAmount(lines.reduce((s, l) => s + l.amountHT, 0));
  const vatAmount = roundDgiAmount(lines.reduce((s, l) => s + l.vatAmount, 0));
  const totalTTC = roundDgiAmount(lines.reduce((s, l) => s + l.totalTTC, 0));
  const vatRatePercent = amountHT > 0 ? nearestMoroccoVatRate((vatAmount / amountHT) * 100) : 20;

  const issue = new Date(issueDate);
  const due = new Date(issue);
  due.setDate(due.getDate() + 30);

  return {
    docType,
    number,
    clientName,
    issueDate,
    dueDate: due.toISOString().slice(0, 10),
    lines,
    amountHT,
    vatAmount,
    totalTTC,
    vatRatePercent,
    status: 'draft',
    metadata: {
      smart_generator: true,
      doc_type: docType,
      params,
      generated_at: new Date().toISOString(),
    },
  };
}

/** Split lines into multiple documents respecting montant_max_par_document. */
export function splitDocumentsByMaxAmount(
  rawDocs: Array<{ clientName: string; issueDate: string; lines: SmartGeneratorLineItem[] }>,
  docType: SmartGeneratorDocType,
  params: SmartGeneratorParams,
  numbering: string[],
): SmartGeneratorDocument[] {
  const out: SmartGeneratorDocument[] = [];
  let numIdx = 0;

  for (const raw of rawDocs) {
    let batch: SmartGeneratorLineItem[] = [];
    let batchTTC = 0;

    const flush = () => {
      if (!batch.length || numIdx >= numbering.length) return;
      out.push(
        aggregateDocument(docType, numbering[numIdx]!, raw.clientName, raw.issueDate, batch, params),
      );
      numIdx += 1;
      batch = [];
      batchTTC = 0;
    };

    for (const line of raw.lines) {
      const max = params.montantMaxParDocument;
      if (max > 0 && batchTTC + line.totalTTC > max && batch.length > 0) {
        flush();
      }
      if (max > 0 && line.totalTTC > max) {
        const unitTTC = line.totalTTC / line.quantity;
        let remaining = line.quantity;
        while (remaining > 0 && numIdx < numbering.length) {
          const maxQty = Math.max(1, Math.floor((max - batchTTC) / unitTTC) || 1);
          const take = Math.min(remaining, maxQty);
          const partial = computeLineItem({
            description: line.description,
            quantity: take,
            unitPriceHT: line.unitPriceHT,
            vatRatePercent: line.vatRatePercent,
            pcgeAccount: line.pcgeAccount,
          });
          batch.push(partial);
          batchTTC += partial.totalTTC;
          remaining -= take;
          if (batchTTC >= max * 0.95) flush();
        }
        continue;
      }
      batch.push(line);
      batchTTC += line.totalTTC;
    }
    flush();
  }

  return out;
}

function parseLlmJson(text: string): RawLlmPayload | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as RawLlmPayload;
  } catch {
    return null;
  }
}

function ruleBasedFallback(prompt: string, params: SmartGeneratorParams): RawLlmPayload {
  const amountMatch = prompt.match(/(\d[\d\s.,]*)\s*(?:mad|dh|dirham)?/i);
  const amount = amountMatch
    ? parseFloat(amountMatch[1]!.replace(/\s/g, '').replace(',', '.')) || 5000
    : 5000;

  return {
    documents: [{
      clientName: 'Client divers',
      issueDate: params.dateDebut || new Date().toISOString().slice(0, 10),
      lines: [{
        description: prompt.slice(0, 120) || 'Prestation / fourniture',
        quantity: 1,
        unitPriceHT: amount,
        vatRatePercent: 20,
        pcgeAccount: '7111',
      }],
    }],
  };
}

function buildNumbering(prefix: SmartGeneratorDocType, start: number, end: number): string[] {
  const codes: Record<SmartGeneratorDocType, string> = {
    facture: 'FAC',
    devis: 'DEV',
    bon_commande: 'BC',
  };
  const p = codes[prefix];
  const nums: string[] = [];
  for (let n = start; n <= end; n++) {
    nums.push(`${p}-${String(n).padStart(5, '0')}`);
  }
  return nums;
}

function clampDate(dateStr: string, params: SmartGeneratorParams): string {
  const d = dateStr.slice(0, 10);
  if (params.dateDebut && d < params.dateDebut) return params.dateDebut;
  if (params.dateFin && d > params.dateFin) return params.dateFin;
  return d;
}

export async function parsePromptToRawDocuments(
  prompt: string,
  params: SmartGeneratorParams,
  language?: string,
): Promise<{ raw: RawLlmPayload; provider: string }> {
  const langHint = language === 'ar'
    ? 'La consigne peut être en arabe.'
    : language === 'darija'
      ? 'La consigne peut être en darija marocaine.'
      : 'La consigne est en français.';

  const userMessage = `${langHint}\n\nConsigne:\n${prompt}\n\nParamètres:\n- Période: ${params.dateDebut} à ${params.dateFin}\n- Numérotation: ${params.numeroDebut} à ${params.numeroFin}\n- Plafond TTC/document: ${params.montantMaxParDocument} MAD`;

  const result = await runAtlasAiWithFallback({
    system: GENERATOR_SYSTEM,
    contextBlock: '',
    sourcesLine: '',
    history: [],
    userMessage,
    ruleBasedFallback: () => JSON.stringify(ruleBasedFallback(prompt, params)),
  });

  const parsed = parseLlmJson(result.answer) ?? ruleBasedFallback(prompt, params);
  return { raw: parsed, provider: result.provider };
}

export function buildSmartGeneratorDocuments(
  raw: RawLlmPayload,
  docType: SmartGeneratorDocType,
  params: SmartGeneratorParams,
): SmartGeneratorDocument[] {
  const numbering = buildNumbering(docType, params.numeroDebut, params.numeroFin);
  const rawDocs = (raw.documents ?? []).map((d) => ({
    clientName: String(d.clientName ?? 'Client divers').trim() || 'Client divers',
    issueDate: clampDate(String(d.issueDate ?? params.dateDebut), params),
    lines: (d.lines ?? []).map(computeLineItem),
  })).filter((d) => d.lines.length > 0);

  if (!rawDocs.length) {
    const fb = ruleBasedFallback('', params);
    return buildSmartGeneratorDocuments(fb, docType, params);
  }

  return splitDocumentsByMaxAmount(rawDocs, docType, params, numbering);
}

export async function persistSmartGeneratorDocuments(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  documents: SmartGeneratorDocument[],
): Promise<Array<SmartGeneratorDocument & { id: string }>> {
  const saved: Array<SmartGeneratorDocument & { id: string }> = [];

  for (const doc of documents) {
    const { data, error } = await db
      .from('atlas_invoices')
      .insert({
        user_id: userId,
        company_id: companyId,
        number: doc.number,
        client_name: doc.clientName,
        issue_date: doc.issueDate,
        due_date: doc.dueDate,
        payment_terms_days: 30,
        amount_ht: doc.amountHT,
        vat_rate: doc.vatRatePercent / 100,
        vat_amount: doc.vatAmount,
        total_ttc: doc.totalTTC,
        status: 'draft',
        generated_by: 'smart_generator',
        validation_status: 'draft',
        metadata: {
          ...doc.metadata,
          doc_type: doc.docType,
          line_items: doc.lines,
        },
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !data) continue;
    saved.push({ ...doc, id: String(data.id) });
  }

  return saved;
}

export async function loadCompanyForSmartGenerator(
  db: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<Partial<AtlasCompany> | null> {
  const { data } = await db
    .from('atlas_companies')
    .select('name, legal_name, trade_name, ice, if_fiscal, rc, address, city, phone, email, logo_url, company_json')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;
  const json = (data.company_json ?? {}) as Record<string, unknown>;

  return {
    raisonSociale: String(data.name ?? json.raisonSociale ?? ''),
    legalName: data.legal_name ? String(data.legal_name) : undefined,
    tradeName: data.trade_name ? String(data.trade_name) : undefined,
    if_fiscal: String(data.if_fiscal ?? json.if_fiscal ?? ''),
    ice: String(data.ice ?? json.ice ?? ''),
    rc: String(data.rc ?? json.rc ?? ''),
    adresse: String(data.address ?? json.adresse ?? ''),
    ville: String(data.city ?? json.ville ?? ''),
    telephone: String(data.phone ?? json.telephone ?? ''),
    email: String(data.email ?? json.email ?? ''),
    logoUrl: data.logo_url ? String(data.logo_url) : undefined,
    activite: String(json.activite ?? ''),
    taxeProfessionnelle: String(json.taxeProfessionnelle ?? json.patent ?? ''),
  } as Partial<AtlasCompany> & { taxeProfessionnelle?: string };
}

export async function runSmartGenerator(
  db: SupabaseClient,
  userId: string,
  request: SmartGeneratorGenerateRequest,
): Promise<SmartGeneratorResult & { company: Partial<AtlasCompany> | null }> {
  const company = await loadCompanyForSmartGenerator(db, request.companyId, userId);
  if (!company) throw new Error('company_not_found');

  const { raw, provider } = await parsePromptToRawDocuments(
    request.prompt,
    request.params,
    request.language,
  );

  let documents = buildSmartGeneratorDocuments(raw, request.docType, request.params);
  const maxDocs = request.params.numeroFin - request.params.numeroDebut + 1;
  if (documents.length > maxDocs) {
    documents = documents.slice(0, maxDocs);
  }

  const persisted = await persistSmartGeneratorDocuments(
    db,
    userId,
    request.companyId,
    documents,
  );

  const summary = {
    count: persisted.length,
    totalHT: roundDgiAmount(persisted.reduce((s, d) => s + d.amountHT, 0)),
    totalTVA: roundDgiAmount(persisted.reduce((s, d) => s + d.vatAmount, 0)),
    totalTTC: roundDgiAmount(persisted.reduce((s, d) => s + d.totalTTC, 0)),
  };

  return { documents: persisted, summary, provider, company };
}

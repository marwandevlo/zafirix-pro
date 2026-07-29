/**
 * Smart Generator — LLM parsing, explicit items, DGI calculations, optional DB persistence.
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
  SmartGeneratorHeader,
  SmartGeneratorItemSpec,
  SmartGeneratorLineItem,
  SmartGeneratorParams,
  SmartGeneratorResult,
} from '@/app/types/atlas-smart-generator';

const DOC_TYPE_LABELS: Record<Exclude<SmartGeneratorDocType, 'autre'>, string> = {
  facture: 'FACTURE',
  devis: 'DEVIS',
  bon_commande: 'BON DE COMMANDE',
};

const DOC_TYPE_CODES: Record<Exclude<SmartGeneratorDocType, 'autre'>, string> = {
  facture: 'FAC',
  devis: 'DEV',
  bon_commande: 'BC',
};

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
          "unit": "Pcs",
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
  unit?: string;
  unitPriceHT?: number;
  vatRatePercent?: number;
  pcgeAccount?: string;
  category?: string;
};

type RawLlmDoc = {
  clientName?: string;
  issueDate?: string;
  lines?: RawLlmLine[];
};

type RawLlmPayload = {
  documents?: RawLlmDoc[];
};

export function resolveDocTitle(docType: SmartGeneratorDocType, customDocTitle?: string): string {
  if (docType === 'autre') {
    return (customDocTitle?.trim() || 'DOCUMENT').toUpperCase();
  }
  return DOC_TYPE_LABELS[docType];
}

function customDocCode(customTitle: string): string {
  const words = customTitle.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'DOC';
  const acronym = words.map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 6);
  if (acronym.length >= 2) return acronym;
  return customTitle.replace(/[^\w]/g, '').slice(0, 4).toUpperCase() || 'DOC';
}

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

function resolveUnitPrice(spec: SmartGeneratorItemSpec): number {
  if (spec.unitPriceHT != null && Number.isFinite(spec.unitPriceHT)) {
    return roundDgiAmount(spec.unitPriceHT);
  }
  const min = spec.unitPriceMin ?? 0;
  const max = spec.unitPriceMax ?? min;
  if (max <= min) return roundDgiAmount(min);
  return roundDgiAmount(min + Math.random() * (max - min));
}

export function computeLineItem(raw: RawLlmLine & Partial<SmartGeneratorItemSpec>): SmartGeneratorLineItem {
  const quantity = Math.max(0.001, Number(raw.quantity ?? 1));
  const unitPriceHT = roundDgiAmount(Number(raw.unitPriceHT ?? resolveUnitPrice(raw as SmartGeneratorItemSpec)));
  const vatRatePercent = nearestMoroccoVatRate(Number(raw.vatRatePercent ?? 20));
  const amountHT = roundDgiAmount(quantity * unitPriceHT);
  const vatAmount = roundDgiAmount(amountHT * (vatRatePercent / 100));
  const totalTTC = roundDgiAmount(amountHT + vatAmount);
  const pcge = raw.pcgeAccount ? String(raw.pcgeAccount).replace(/\D/g, '').slice(0, 8) : undefined;
  const category = raw.category ? String(raw.category).trim() : undefined;
  const reference = raw.reference ? String(raw.reference).trim() : undefined;
  const designation = String(raw.designation ?? raw.description ?? 'Prestation').trim() || 'Prestation';
  const description = category ? `[${category}] ${designation}` : designation;

  return {
    reference,
    description,
    quantity,
    unit: String(raw.unit ?? 'Pcs').trim() || 'Pcs',
    unitPriceHT,
    vatRatePercent,
    pcgeAccount: pcge && isValidPcgeAccount(pcge) ? pcge : '7111',
    category,
    amountHT,
    vatAmount,
    totalTTC,
  };
}

function aggregateDocument(
  docType: SmartGeneratorDocType,
  docTitle: string,
  customDocTitle: string | undefined,
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
    docTitle,
    customDocTitle,
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
      doc_title: docTitle,
      params,
      generated_at: new Date().toISOString(),
    },
  };
}

export function buildNumbering(
  docType: SmartGeneratorDocType,
  start: number,
  end: number,
  customDocTitle?: string,
): string[] {
  const prefix =
    docType === 'autre'
      ? customDocCode(customDocTitle ?? 'DOC')
      : DOC_TYPE_CODES[docType];
  const nums: string[] = [];
  for (let n = start; n <= end; n++) {
    nums.push(`${prefix}-${String(n).padStart(5, '0')}`);
  }
  return nums;
}

/** Split lines into multiple documents respecting montant_max_par_document. */
export function splitDocumentsByMaxAmount(
  rawDocs: Array<{ clientName: string; issueDate: string; lines: SmartGeneratorLineItem[] }>,
  docType: SmartGeneratorDocType,
  docTitle: string,
  customDocTitle: string | undefined,
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
        aggregateDocument(
          docType,
          docTitle,
          customDocTitle,
          numbering[numIdx]!,
          raw.clientName,
          raw.issueDate,
          batch,
          params,
        ),
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
            designation: line.description,
            quantity: take,
            unit: line.unit,
            unitPriceHT: line.unitPriceHT,
            vatRatePercent: line.vatRatePercent,
            pcgeAccount: line.pcgeAccount,
            category: line.category,
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

function ruleBasedFallback(
  prompt: string,
  params: SmartGeneratorParams,
  itemSpecs?: SmartGeneratorItemSpec[],
): RawLlmPayload {
  if (itemSpecs?.length) {
    return {
      documents: [{
        clientName: params.defaultClientName ?? 'Client divers',
        issueDate: params.dateDebut || new Date().toISOString().slice(0, 10),
        lines: itemSpecs.map((s) => ({
          description: s.designation,
          category: s.category,
          quantity: s.quantity,
          unit: s.unit,
          unitPriceHT: resolveUnitPrice(s),
          vatRatePercent: s.vatRatePercent ?? 20,
          pcgeAccount: s.pcgeAccount,
        })),
      }],
    };
  }

  const amountMatch = prompt.match(/(\d[\d\s.,]*)\s*(?:mad|dh|dirham)?/i);
  const amount = amountMatch
    ? parseFloat(amountMatch[1]!.replace(/\s/g, '').replace(',', '.')) || 5000
    : 5000;

  return {
    documents: [{
      clientName: params.defaultClientName ?? 'Client divers',
      issueDate: params.dateDebut || new Date().toISOString().slice(0, 10),
      lines: [{
        description: prompt.slice(0, 120) || 'Prestation / fourniture',
        quantity: 1,
        unit: 'Forfait',
        unitPriceHT: amount,
        vatRatePercent: 20,
        pcgeAccount: '7111',
      }],
    }],
  };
}

function clampDate(dateStr: string, params: SmartGeneratorParams): string {
  const d = dateStr.slice(0, 10);
  if (params.dateDebut && d < params.dateDebut) return params.dateDebut;
  if (params.dateFin && d > params.dateFin) return params.dateFin;
  return d;
}

/** Build raw docs directly from explicit item specs (priority path). */
export function buildFromExplicitItemSpecs(
  itemSpecs: SmartGeneratorItemSpec[],
  params: SmartGeneratorParams,
): RawLlmPayload {
  const lines = itemSpecs
    .filter((s) => s.designation?.trim())
    .map((s) => ({
      description: s.designation,
      reference: s.reference,
      category: s.category,
      quantity: s.quantity,
      unit: s.unit,
      unitPriceHT: resolveUnitPrice(s),
      vatRatePercent: s.vatRatePercent ?? 20,
      pcgeAccount: s.pcgeAccount,
    }));

  const count = Math.max(1, params.documentCount ?? 1);
  const documents: RawLlmDoc[] = [];

  for (let i = 0; i < count; i++) {
    documents.push({
      clientName: params.defaultClientName ?? 'Client divers',
      issueDate: params.dateDebut,
      lines,
    });
  }

  return { documents };
}

export async function parsePromptToRawDocuments(
  prompt: string,
  params: SmartGeneratorParams,
  itemSpecs?: SmartGeneratorItemSpec[],
  language?: string,
): Promise<{ raw: RawLlmPayload; provider: string; usedExplicitItems: boolean }> {
  if (itemSpecs?.some((s) => s.designation?.trim())) {
    return {
      raw: buildFromExplicitItemSpecs(itemSpecs, params),
      provider: 'explicit-items',
      usedExplicitItems: true,
    };
  }

  const langHint = language === 'ar'
    ? 'La consigne peut être en arabe.'
    : language === 'darija'
      ? 'La consigne peut être en darija marocaine.'
      : 'La consigne est en français.';

  const userMessage = [
    langHint,
    prompt ? `\nConsigne:\n${prompt}` : '',
    `\nParamètres:\n- Période: ${params.dateDebut} à ${params.dateFin}`,
    `- Numérotation: ${params.numeroDebut} à ${params.numeroFin}`,
    `- Plafond TTC/document: ${params.montantMaxParDocument} MAD`,
    params.documentCount ? `- Nombre de documents: ${params.documentCount}` : '',
    params.defaultClientName ? `- Client: ${params.defaultClientName}` : '',
  ].join('\n');

  const result = await runAtlasAiWithFallback({
    system: GENERATOR_SYSTEM,
    contextBlock: '',
    sourcesLine: '',
    history: [],
    userMessage,
    ruleBasedFallback: () => JSON.stringify(ruleBasedFallback(prompt, params, itemSpecs)),
  });

  const parsed = parseLlmJson(result.answer) ?? ruleBasedFallback(prompt, params, itemSpecs);
  return { raw: parsed, provider: result.provider, usedExplicitItems: false };
}

/** Expand or trim document list to exact documentCount. */
export function applyDocumentCount(
  documents: SmartGeneratorDocument[],
  params: SmartGeneratorParams,
  docType: SmartGeneratorDocType,
  docTitle: string,
  customDocTitle: string | undefined,
): SmartGeneratorDocument[] {
  const target = params.documentCount;
  if (!target || target <= 0) return documents;
  if (documents.length === target) return documents;

  if (documents.length > target) return documents.slice(0, target);

  const numbering = buildNumbering(docType, params.numeroDebut, params.numeroFin, customDocTitle);
  const template = documents[0] ?? aggregateDocument(
    docType,
    docTitle,
    customDocTitle,
    numbering[0] ?? 'DOC-00001',
    params.defaultClientName ?? 'Client divers',
    params.dateDebut,
    [computeLineItem({ description: 'Prestation', quantity: 1, unit: 'Forfait', unitPriceHT: 1000 })],
    params,
  );

  const out = [...documents];
  while (out.length < target && out.length < numbering.length) {
    const num = numbering[out.length] ?? `${customDocCode(customDocTitle ?? 'DOC')}-${String(out.length + 1).padStart(5, '0')}`;
    out.push({
      ...template,
      number: num,
      metadata: { ...template.metadata, generated_at: new Date().toISOString() },
    });
  }
  return out.slice(0, target);
}

export function buildSmartGeneratorDocuments(
  raw: RawLlmPayload,
  docType: SmartGeneratorDocType,
  params: SmartGeneratorParams,
  customDocTitle?: string,
): SmartGeneratorDocument[] {
  const docTitle = resolveDocTitle(docType, customDocTitle);
  const numbering = buildNumbering(docType, params.numeroDebut, params.numeroFin, customDocTitle);
  const rawDocs = (raw.documents ?? []).map((d) => ({
    clientName: String(d.clientName ?? params.defaultClientName ?? 'Client divers').trim() || 'Client divers',
    issueDate: clampDate(String(d.issueDate ?? params.dateDebut), params),
    lines: (d.lines ?? []).map((l) => computeLineItem(l)),
  })).filter((d) => d.lines.length > 0);

  if (!rawDocs.length) {
    const fb = ruleBasedFallback('', params);
    return buildSmartGeneratorDocuments(fb, docType, params, customDocTitle);
  }

  let docs = splitDocumentsByMaxAmount(rawDocs, docType, docTitle, customDocTitle, params, numbering);
  const maxDocs = params.numeroFin - params.numeroDebut + 1;
  if (docs.length > maxDocs) docs = docs.slice(0, maxDocs);
  docs = applyDocumentCount(docs, params, docType, docTitle, customDocTitle);
  return docs;
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
          doc_title: doc.docTitle,
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

export function mergeCompanyHeader(
  dbCompany: Partial<AtlasCompany> | null,
  customHeader?: SmartGeneratorHeader | null,
): Partial<AtlasCompany> & { taxeProfessionnelle?: string; capitalSocial?: string; fax?: string } {
  const base = dbCompany ?? {};
  const custom = customHeader ?? {};
  const baseJson = base as Record<string, unknown>;
  return {
    ...base,
    raisonSociale: custom.raisonSociale?.trim() || base.raisonSociale || '',
    ice: custom.ice?.trim() || base.ice || '',
    if_fiscal: custom.if_fiscal?.trim() || base.if_fiscal || '',
    rc: custom.rc?.trim() || base.rc || '',
    cnss: custom.cnss?.trim() || base.cnss || '',
    adresse: custom.adresse?.trim() || base.adresse || '',
    ville: custom.ville?.trim() || base.ville || '',
    telephone: custom.telephone?.trim() || base.telephone || '',
    email: custom.email?.trim() || base.email || '',
    logoUrl: custom.logoUrl?.trim() || base.logoUrl,
    taxeProfessionnelle: custom.patent?.trim() || (base as { taxeProfessionnelle?: string }).taxeProfessionnelle || '',
    capitalSocial: custom.capitalSocial?.trim() || String(baseJson.capitalSocial ?? baseJson.capital_social ?? ''),
    fax: custom.fax?.trim() || String(baseJson.fax ?? ''),
  };
}

export async function runSmartGenerator(
  db: SupabaseClient,
  userId: string,
  request: SmartGeneratorGenerateRequest,
): Promise<SmartGeneratorResult & { company: Partial<AtlasCompany> }> {
  let dbCompany: Partial<AtlasCompany> | null = null;
  if (request.companyId) {
    dbCompany = await loadCompanyForSmartGenerator(db, request.companyId, userId);
  }

  const company = mergeCompanyHeader(dbCompany, request.customHeader);

  const hasPrompt = Boolean(request.prompt?.trim());
  const hasItems = Boolean(request.itemSpecs?.some((s) => s.designation?.trim()));
  if (!hasPrompt && !hasItems) {
    throw new Error('prompt_or_items_required');
  }

  const { raw, provider } = await parsePromptToRawDocuments(
    request.prompt,
    request.params,
    request.itemSpecs,
    request.language,
  );

  let documents = buildSmartGeneratorDocuments(
    raw,
    request.docType,
    request.params,
    request.customDocTitle,
  );

  let persisted = false;
  let outputDocs: Array<SmartGeneratorDocument & { id?: string }> = documents;

  const shouldPersist = request.persistToDb !== false && Boolean(request.companyId) && dbCompany;
  if (shouldPersist && request.companyId) {
    const saved = await persistSmartGeneratorDocuments(db, userId, request.companyId, documents);
    if (saved.length) {
      outputDocs = saved;
      persisted = true;
    }
  }

  const summary = {
    count: outputDocs.length,
    totalHT: roundDgiAmount(outputDocs.reduce((s, d) => s + d.amountHT, 0)),
    totalTVA: roundDgiAmount(outputDocs.reduce((s, d) => s + d.vatAmount, 0)),
    totalTTC: roundDgiAmount(outputDocs.reduce((s, d) => s + d.totalTTC, 0)),
  };

  return { documents: outputDocs, summary, provider, persisted, company };
}

/**
 * Phase 13B — specialized explainers (accounting, TVA, IS, readiness, documents).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSourceRef } from '@/app/types/atlas-ai-copilot';
import { refreshAtlasAiContext, contextToPromptBlock, buildAtlasAiContext } from '@/app/lib/atlas-ai-context';
import { detectAtlasAiAnomalies } from '@/app/lib/atlas-ai-anomalies';
import { explainReadiness } from '@/app/lib/atlas-ai-audit';
import {
  runAtlasAiCopilot,
  EXPLAINER_ACCOUNTING,
  EXPLAINER_TVA,
  EXPLAINER_IS,
  EXPLAINER_DOCUMENT,
  EXPLAINER_READINESS,
  COPILOT_SYSTEM,
  formatSourcesFooter,
} from '@/app/lib/atlas-ai-copilot';
import { ATLAS_AI_DATA_UNAVAILABLE, computeCopilotConfidence } from '@/app/lib/atlas-ai-confidence';

export type ExplainType =
  | 'accounting_entry'
  | 'account_code'
  | 'tva'
  | 'is'
  | 'document'
  | 'readiness'
  | 'general';

export type ExplainRequest = {
  type: ExplainType;
  entityId?: string;
  accountCode?: string;
  question?: string;
  companyId?: string | null;
  payload?: Record<string, unknown>;
};

export type ExplainResult = {
  answer: string;
  sources: AiSourceRef[];
  confidence: number;
  type: ExplainType;
  structured?: Record<string, unknown>;
};

function filterCo<T extends { company_id?: string | null }>(
  rows: T[] | null | undefined,
  companyId: string | null,
): T[] {
  if (!companyId) return rows ?? [];
  return (rows ?? []).filter((r) => !r.company_id || r.company_id === companyId);
}

export async function runAtlasAiExplain(
  db: SupabaseClient,
  userId: string,
  req: ExplainRequest,
): Promise<ExplainResult> {
  const explainType = req.type ?? 'general';
  const companyId = req.companyId?.trim() || null;
  const question = req.question?.trim() || defaultQuestion(explainType);

  const { snapshot } = await refreshAtlasAiContext(db, { userId, companyId });
  const { sources: baseSources } = await buildAtlasAiContext(db, { userId, companyId });
  const sources: AiSourceRef[] = [...baseSources];
  let system = COPILOT_SYSTEM;
  let subjectBlock = '';
  let subjectLoaded = true;
  let structured: Record<string, unknown> | undefined;

  if (explainType === 'readiness') {
    const readiness = await explainReadiness(db, userId, companyId);
    return {
      answer: readiness.explanation,
      sources: readiness.sources,
      confidence: computeCopilotConfidence({
        sources: readiness.sources,
        hasAnswer: true,
        contextLoaded: true,
        subjectLoaded: readiness.score >= 0,
      }),
      type: 'readiness',
      structured: {
        score: readiness.score,
        breakdown: readiness.breakdown,
      },
    };
  }

  if (explainType === 'accounting_entry' && req.entityId) {
    system = EXPLAINER_ACCOUNTING;
    const { data: entry } = await db
      .from('atlas_accounting_entries')
      .select('*')
      .eq('id', req.entityId)
      .eq('user_id', userId)
      .maybeSingle();
    subjectLoaded = !!entry;
    const { data: auditLogs } = await db
      .from('atlas_audit_logs')
      .select('id, action, created_at, metadata')
      .eq('user_id', userId)
      .eq('entity_id', req.entityId)
      .order('created_at', { ascending: false })
      .limit(10);
    const entryJson = entry?.entry_json as Record<string, unknown> | null;
    const sourceDocId = entryJson?.source_document_id ?? entryJson?.document_id;
    let linkedDoc = null;
    if (sourceDocId) {
      const { data } = await db.from('atlas_documents').select('id, title, document_type, validation_status').eq('id', String(sourceDocId)).eq('user_id', userId).maybeSingle();
      linkedDoc = data;
      if (data) sources.push({ type: 'document', id: String(data.id), label: String(data.title ?? 'Document') });
    }
    structured = {
      accounting_meaning: entryJson?.label ?? entryJson?.description ?? null,
      fiscal_impact: entryJson?.fiscal_impact ?? null,
      tva_impact: entryJson?.tva_amount ?? entryJson?.vat_amount ?? null,
      linked_documents: linkedDoc ? [linkedDoc] : [],
    };
    subjectBlock = `[ÉCRITURE]\n${JSON.stringify({ entry, auditLogs, linkedDoc }, null, 2)}`;
    sources.push({ type: 'accounting_entry', id: req.entityId, label: 'Écriture comptable' });
    if (auditLogs?.length) sources.push({ type: 'audit_log', id: req.entityId, label: 'Journal audit' });
  } else if (explainType === 'account_code') {
    system = EXPLAINER_ACCOUNTING;
    const code = (req.accountCode ?? req.entityId ?? '').trim();
    const { data: entries } = await db
      .from('atlas_accounting_entries')
      .select('id, entry_json, validation_status, company_id')
      .eq('user_id', userId)
      .limit(500);
    const filtered = filterCo(entries, companyId);
    const matching = filtered.filter((e) => {
      const j = e.entry_json as { account?: string; compte?: string; lines?: Array<{ account?: string }> } | null;
      const acc = String(j?.account ?? j?.compte ?? '');
      if (acc.startsWith(code)) return true;
      return (j?.lines ?? []).some((l) => String(l.account ?? '').startsWith(code));
    });
    subjectLoaded = matching.length > 0;
    structured = {
      account_code: code,
      entries_count: matching.length,
      sample_entries: matching.slice(0, 10).map((e) => e.entry_json),
    };
    subjectBlock = `[COMPTE PCGE ${code}]\n${JSON.stringify(structured, null, 2)}`;
    sources.push({ type: 'accounting_entry', id: code, label: `Compte ${code}` });
  } else if (explainType === 'document' && req.entityId) {
    system = EXPLAINER_DOCUMENT;
    const { data: doc } = await db.from('atlas_documents').select('*').eq('id', req.entityId).eq('user_id', userId).maybeSingle();
    const { data: route } = await db.from('zafirix_routing_records').select('*').eq('source_document_id', req.entityId).limit(5);
    const { data: tvaRowsRaw } = await db.from('zafirix_tva_suggestions').select('id, validation_status, vat_amount, metadata').eq('user_id', userId).limit(50);
    const tvaRows = (tvaRowsRaw ?? []).filter((r) => {
      const meta = (r.metadata && typeof r.metadata === 'object') ? r.metadata as Record<string, unknown> : {};
      return String(meta.source_document_id ?? '') === req.entityId;
    });
    subjectLoaded = !!doc;
    structured = {
      document_type: doc?.document_type ?? doc?.type ?? null,
      extracted_data: doc?.content ?? doc?.ocr_result ?? null,
      routing_path: route ?? [],
      validation_status: doc?.validation_status ?? route?.[0]?.validation_status ?? null,
      tva_impact: tvaRows ?? [],
    };
    subjectBlock = `[DOCUMENT]\n${JSON.stringify({ doc, routing: route, tva: tvaRows }, null, 2)}`;
    sources.push({ type: 'document', id: req.entityId, label: doc?.title ? String(doc.title) : 'Document' });
    if (route?.length) sources.push({ type: 'anomaly', id: 'routing', label: 'Routage document' });
  } else if (explainType === 'tva') {
    system = EXPLAINER_TVA;
    const { anomalies } = await detectAtlasAiAnomalies(db, userId, companyId);
    const tvaAnomalies = anomalies.filter((a) => a.code === 'tva-inconsistency');
    const { data: tvaRows } = await db
      .from('zafirix_tva_suggestions')
      .select('id, amount_ht, vat_rate, vat_amount, validation_status, metadata, company_id')
      .eq('user_id', userId)
      .limit(100);
    const tvaFiltered = filterCo(tvaRows, companyId);
    const rejected = tvaFiltered.filter((r) => r.validation_status === 'rejected');
    structured = {
      tva_due_context: snapshot.tva,
      impacting_invoices: tvaFiltered.slice(0, 20),
      rejected_count: rejected.length,
      anomalies: tvaAnomalies,
    };
    subjectBlock = `[TVA EXPERT]\n${JSON.stringify(structured, null, 2)}`;
    sources.push({ type: 'tva', id: 'context', label: 'Module TVA' });
    if (tvaAnomalies.length) sources.push({ type: 'anomaly', id: 'tva-inconsistency', label: 'Anomalies TVA' });
  } else if (explainType === 'is') {
    system = EXPLAINER_IS;
    const fy = new Date().getFullYear();
    const { data: isDraft } = await db.from('atlas_is_drafts').select('*').eq('user_id', userId).eq('fiscal_year', fy).maybeSingle();
    structured = {
      is_draft: isDraft,
      liasse: snapshot.liasse,
      fiscal_result: snapshot.liasse,
      cpc: (snapshot.liasse as { bilan?: unknown })?.bilan ?? null,
    };
    subjectBlock = `[IS + LIASSE + CPC]\n${JSON.stringify(structured, null, 2)}`;
    sources.push({ type: 'liasse', id: String(fy), label: 'IS/Liasse/CPC' });
  } else {
    subjectBlock = req.payload ? JSON.stringify(req.payload) : '';
    subjectLoaded = !!req.payload;
  }

  if (!subjectLoaded && explainType !== 'general' && explainType !== 'tva' && explainType !== 'is') {
    return {
      answer: ATLAS_AI_DATA_UNAVAILABLE,
      sources,
      confidence: 0,
      type: explainType,
      structured,
    };
  }

  const result = await runAtlasAiCopilot({
    system,
    contextBlock: `${contextToPromptBlock(snapshot)}\n\n${subjectBlock}`,
    sources,
    history: [],
    userMessage: question,
  });

  if (!result.ok) {
    return {
      answer: subjectBlock ? `${ATLAS_AI_DATA_UNAVAILABLE} (${result.error})` : ATLAS_AI_DATA_UNAVAILABLE,
      sources,
      confidence: 0,
      type: explainType,
      structured,
    };
  }

  const answer = `${result.answer}${formatSourcesFooter(sources)}`;
  return {
    answer,
    sources,
    confidence: computeCopilotConfidence({
      sources,
      hasAnswer: true,
      contextLoaded: true,
      subjectLoaded,
    }),
    type: explainType,
    structured,
  };
}

function defaultQuestion(type: ExplainType): string {
  switch (type) {
    case 'accounting_entry':
      return 'Pourquoi cette écriture existe ? Quel est son impact comptable, fiscal et TVA ?';
    case 'account_code':
      return 'Explique ce compte PCGE et son utilisation dans mes écritures.';
    case 'tva':
      return 'Quelle TVA vais-je payer ? Quelles factures impactent ma TVA et quelles anomalies existent ?';
    case 'is':
      return 'Comment est calculé mon IS ? Quels éléments augmentent mon IS ?';
    case 'document':
      return 'Expliquer ce document: type, champs extraits, impact comptable et fiscal, routage, validation.';
    case 'readiness':
      return 'Explique mon score de readiness et les actions correctives.';
    default:
      return 'Explique cet élément en détail pour un dirigeant.';
  }
}

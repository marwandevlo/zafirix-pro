import type Anthropic from '@anthropic-ai/sdk';
import { ATLAS_AI_MULTILINGUAL_DARIJA } from '@/app/lib/atlas-ai-language';
import {
  computeLineItem,
  resolveDocTitle,
} from '@/app/lib/atlas-smart-generator';
import { roundDgiAmount } from '@/app/lib/atlas-tva-dgi';
import type {
  SmartGeneratorDocType,
  SmartGeneratorDocument,
  SmartGeneratorHeader,
  SmartGeneratorLineItem,
} from '@/app/types/atlas-smart-generator';

export type SmartGeneratorChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SmartGeneratorChatAttachment = {
  filename: string;
  mimeType: string;
  textContent: string;
  truncated?: boolean;
};

export type SmartGeneratorChatRequest = {
  message: string;
  history: SmartGeneratorChatMessage[];
  documentDraft: string;
  documentTitle: string;
  companyHeader?: SmartGeneratorHeader | null;
  attachment?: SmartGeneratorChatAttachment | null;
};

export type SmartGeneratorChatParsed = {
  reply: string;
  document: string;
  documentTitle: string;
  structured: SmartGeneratorDocument | null;
};

export const SG_CHAT_REPLY_MARKER = '<<REPLY>>';
export const SG_CHAT_DOCUMENT_MARKER = '<<DOCUMENT>>';
export const SG_CHAT_STRUCTURED_MARKER = '<<STRUCTURED>>';

const KNOWN_DOC_TYPES = new Set<SmartGeneratorDocType>(['facture', 'devis', 'bon_commande', 'autre']);

function normalizeDocType(raw: unknown): SmartGeneratorDocType {
  const value = String(raw ?? 'autre').toLowerCase().trim();
  if (KNOWN_DOC_TYPES.has(value as SmartGeneratorDocType)) {
    return value as SmartGeneratorDocType;
  }
  return 'autre';
}

function aggregateStructuredDoc(raw: Record<string, unknown>): SmartGeneratorDocument | null {
  const docType = normalizeDocType(raw.docType ?? raw.doc_type ?? raw.type);
  const customDocTitle =
    String(raw.customDocTitle ?? raw.custom_doc_title ?? raw.title ?? '').trim() || undefined;
  const docTitle =
    String(raw.docTitle ?? raw.doc_title ?? '').trim() ||
    resolveDocTitle(docType, customDocTitle);
  const number = String(raw.number ?? raw.numero ?? raw.reference ?? 'DOC-00001').trim() || 'DOC-00001';
  const clientName =
    String(raw.clientName ?? raw.client_name ?? raw.client ?? raw.destinataire ?? 'Client divers').trim() ||
    'Client divers';
  const issueDate = String(
    raw.issueDate ?? raw.issue_date ?? raw.date ?? new Date().toISOString().slice(0, 10),
  ).slice(0, 10);
  const dueDateRaw = String(raw.dueDate ?? raw.due_date ?? raw.echeance ?? '').slice(0, 10);
  const dueDate =
    dueDateRaw ||
    (() => {
      const d = new Date(issueDate);
      d.setDate(d.getDate() + 30);
      return d.toISOString().slice(0, 10);
    })();

  const linesRaw = Array.isArray(raw.lines)
    ? raw.lines
    : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.lignes)
        ? raw.lignes
        : [];

  const lines: SmartGeneratorLineItem[] = linesRaw
    .map((l) => {
      if (!l || typeof l !== 'object') return null;
      const row = l as Record<string, unknown>;
      if (!String(row.description ?? row.designation ?? row.libelle ?? '').trim()) return null;
      return computeLineItem(row);
    })
    .filter((l): l is SmartGeneratorLineItem => l !== null);

  if (!lines.length) return null;

  const amountHT =
    raw.amountHT != null
      ? roundDgiAmount(Number(raw.amountHT))
      : roundDgiAmount(lines.reduce((s, l) => s + l.amountHT, 0));
  const vatAmount =
    raw.vatAmount != null
      ? roundDgiAmount(Number(raw.vatAmount))
      : roundDgiAmount(lines.reduce((s, l) => s + l.vatAmount, 0));
  const totalTTC =
    raw.totalTTC != null
      ? roundDgiAmount(Number(raw.totalTTC))
      : roundDgiAmount(lines.reduce((s, l) => s + l.totalTTC, 0));
  const vatRatePercent =
    raw.vatRatePercent != null
      ? roundDgiAmount(Number(raw.vatRatePercent))
      : amountHT > 0
        ? roundDgiAmount((vatAmount / amountHT) * 100)
        : 20;

  const metadata: Record<string, unknown> = {
    smart_generator_chat: true,
    generated_at: new Date().toISOString(),
  };
  if (raw.clauses) metadata.clauses = raw.clauses;
  if (raw.notes) metadata.notes = raw.notes;
  if (raw.retentionPercent != null) metadata.retention_percent = raw.retentionPercent;
  if (raw.customFields && typeof raw.customFields === 'object') metadata.custom_fields = raw.customFields;

  return {
    docType,
    docTitle,
    customDocTitle,
    number,
    clientName,
    issueDate,
    dueDate,
    lines,
    amountHT,
    vatAmount,
    totalTTC,
    vatRatePercent,
    status: 'draft',
    metadata,
  };
}

export function parseSmartGeneratorStructuredJson(text: string): SmartGeneratorDocument | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '{}' || trimmed === 'null') return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return aggregateStructuredDoc(parsed);
  } catch {
    return null;
  }
}

export function inferDocumentTitle(
  document: string,
  structured: SmartGeneratorDocument | null,
  fallback: string,
): string {
  if (structured?.docTitle?.trim()) return structured.docTitle.trim();
  const h1 = document.match(/^#\s+(.+)$/m);
  if (h1?.[1]?.trim()) return h1[1].trim();
  const firstLine = document.split('\n').find((l) => l.trim());
  if (firstLine) {
    const cleaned = firstLine.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').trim();
    if (cleaned.length > 0 && cleaned.length <= 80) return cleaned;
  }
  return fallback;
}

export function buildSmartGeneratorChatSystemPrompt(params: {
  documentDraft: string;
  documentTitle: string;
  companyHeader?: SmartGeneratorHeader | null;
  attachment?: SmartGeneratorChatAttachment | null;
}): string {
  const h = params.companyHeader;
  const companyBlock = h?.raisonSociale?.trim()
    ? `
CONTEXTE SOCIÉTÉ (utilise si pertinent — l'utilisateur peut demander d'autres coordonnées):
- Raison sociale: ${h.raisonSociale}
- ICE: ${h.ice || '—'} | IF: ${h.if_fiscal || '—'} | RC: ${h.rc || '—'}
- Patente: ${h.patent || '—'} | CNSS: ${h.cnss || '—'} | Capital: ${h.capitalSocial || '—'}
- Adresse: ${h.adresse || '—'} ${h.ville || ''}
- Tél: ${h.telephone || '—'} | Fax: ${h.fax || '—'} | Email: ${h.email || '—'}
`
    : '\nAucune société pré-remplie — intègre ou demande les coordonnées selon la consigne utilisateur.\n';

  const draftBlock = params.documentDraft.trim()
    ? `\nDOCUMENT EN COURS (${params.documentTitle}):\n---\n${params.documentDraft.trim()}\n---\n`
    : '\nDocument vierge — l\'utilisateur peut créer n\'importe quel contenu from scratch.\n';

  const attachmentBlock = params.attachment?.textContent?.trim()
    ? `\nPIÈCE JOINTE (${params.attachment.filename}):\n---\n${params.attachment.textContent.trim()}\n---\n`
    : '';

  return `Tu es Smart Generator IA — moteur conversationnel ouvert de Zafirix Atlas (Maroc), comparable à ChatGPT/Gemini pour documents métier.

PHILOSOPHIE:
- Aucune limite rigide sur le type, la structure ou le format du document.
- Exécute TOUTES les instructions de l'utilisateur en une seule réponse quand c'est possible (multi-étapes : calculs + clauses + reformatage + traduction + totaux + colonnes custom, etc.).
- Itère librement : réécris, restructure, traduis (FR/AR/Darija), fusionne des pièces jointes, ajoute des clauses (retenue de garantie, pénalités, conditions de paiement…).
- Types possibles (liste non exhaustive) : factures, devis, bons de commande/livraison, reçus, bulletins de paie, lettres, attestations, grilles comptables, tableaux de bord, notes, contrats commerciaux, fiches custom.

${companyBlock}
${draftBlock}
${attachmentBlock}

RÉFÉRENCE CONFORMITÉ MAROC (applique quand pertinent, sans bloquer la créativité):
- TVA DGI : 0%, 7%, 10%, 14%, 20%
- PCGE : comptes 3 à 8 chiffres
- Montants MAD, 2 décimales, recalcule toujours HT/TVA/TTC/net/retenues si demandé
- Mentions officielles : ICE, IF, RC, Patente, CNSS quand le document l'exige

FORMAT DE RÉPONSE (trois sections, ordre strict):
${SG_CHAT_REPLY_MARKER}
[Réponse conversationnelle : résume ce que tu as fait, pose des questions si besoin, confirme les calculs/modifications]
${SG_CHAT_DOCUMENT_MARKER}
[Document COMPLET mis à jour — source de vérité pour l'aperçu live]

Règles <<DOCUMENT>>:
- Markdown autorisé et encouragé : titres (#), **gras**, listes, séparateurs, blocs de clause, tableaux markdown (| col | col |)
- Tableaux : autant de colonnes que demandé (3, 4, 5…), en-têtes traduits si demandé
- Calculs visibles et cohérents (sous-totaux, TVA par taux, retenue %, net à payer)
- Document ENTIER à chaque modification (jamais un diff partiel)
- Mise en forme professionnelle marocaine quand le contexte l'impose

${SG_CHAT_STRUCTURED_MARKER}
[OPTIONNEL — JSON sans markdown, uniquement si le document contient des lignes tabulaires exportables PDF/Excel.
Champs flexibles acceptés : docType, docTitle, customDocTitle, number, clientName, issueDate, dueDate, lines[], amountHT, vatAmount, totalTTC, clauses, retentionPercent, customFields.
Omettez ou {} si document non tabulaire (lettre, clause seule, etc.).]

${ATLAS_AI_MULTILINGUAL_DARIJA}`;
}

export function buildSmartGeneratorChatMessages(params: SmartGeneratorChatRequest): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of params.history.slice(-30)) {
    if (!msg.content.trim()) continue;
    messages.push({ role: msg.role, content: msg.content.trim() });
  }

  let userContent = params.message.trim();
  if (params.attachment?.filename) {
    userContent = `${userContent}\n\n[Pièce jointe : « ${params.attachment.filename} » — intègre, digitalise ou reformate selon ma consigne.]`.trim();
  }
  messages.push({ role: 'user', content: userContent });
  return messages;
}

export function parseSmartGeneratorChatResponse(raw: string, fallbackTitle: string): SmartGeneratorChatParsed {
  const text = raw.trim();
  const replyIdx = text.indexOf(SG_CHAT_REPLY_MARKER);
  const docIdx = text.indexOf(SG_CHAT_DOCUMENT_MARKER);
  const structIdx = text.indexOf(SG_CHAT_STRUCTURED_MARKER);

  let reply = '';
  let document = '';
  let structuredText = '';

  if (replyIdx !== -1 && docIdx !== -1) {
    reply = text.slice(replyIdx + SG_CHAT_REPLY_MARKER.length, docIdx).trim();
    if (structIdx !== -1 && structIdx > docIdx) {
      document = text.slice(docIdx + SG_CHAT_DOCUMENT_MARKER.length, structIdx).trim();
      structuredText = text.slice(structIdx + SG_CHAT_STRUCTURED_MARKER.length).trim();
    } else {
      document = text.slice(docIdx + SG_CHAT_DOCUMENT_MARKER.length).trim();
    }
  } else if (docIdx !== -1) {
    reply = text.slice(0, docIdx).replace(SG_CHAT_REPLY_MARKER, '').trim();
    if (structIdx !== -1 && structIdx > docIdx) {
      document = text.slice(docIdx + SG_CHAT_DOCUMENT_MARKER.length, structIdx).trim();
      structuredText = text.slice(structIdx + SG_CHAT_STRUCTURED_MARKER.length).trim();
    } else {
      document = text.slice(docIdx + SG_CHAT_DOCUMENT_MARKER.length).trim();
    }
  } else {
    reply = text.replace(SG_CHAT_REPLY_MARKER, '').trim();
  }

  const structured = structuredText ? parseSmartGeneratorStructuredJson(structuredText) : null;
  const documentTitle = inferDocumentTitle(document, structured, fallbackTitle);

  return {
    reply: reply || 'Document mis à jour.',
    document,
    documentTitle,
    structured,
  };
}

/** Live stream split — preview document only (hide structured JSON). */
export function splitSmartGeneratorStreamBuffer(buffer: string): {
  reply: string;
  document: string;
} {
  const docIdx = buffer.indexOf(SG_CHAT_DOCUMENT_MARKER);
  const structIdx = buffer.indexOf(SG_CHAT_STRUCTURED_MARKER);

  if (docIdx === -1) {
    const reply = buffer.replace(SG_CHAT_REPLY_MARKER, '').trimStart();
    return { reply, document: '' };
  }

  const replyStart = buffer.indexOf(SG_CHAT_REPLY_MARKER);
  const reply =
    replyStart !== -1
      ? buffer.slice(replyStart + SG_CHAT_REPLY_MARKER.length, docIdx).trimStart()
      : buffer.slice(0, docIdx).trimStart();

  const docEnd = structIdx !== -1 && structIdx > docIdx ? structIdx : buffer.length;
  const document = buffer.slice(docIdx + SG_CHAT_DOCUMENT_MARKER.length, docEnd);

  return { reply, document };
}

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

const VALID_DOC_TYPES = new Set<SmartGeneratorDocType>(['facture', 'devis', 'bon_commande', 'autre']);

function aggregateStructuredDoc(
  raw: Record<string, unknown>,
): SmartGeneratorDocument | null {
  const docType = String(raw.docType ?? raw.doc_type ?? 'facture') as SmartGeneratorDocType;
  if (!VALID_DOC_TYPES.has(docType)) return null;

  const customDocTitle = String(raw.customDocTitle ?? raw.custom_doc_title ?? '').trim() || undefined;
  const docTitle = resolveDocTitle(docType, customDocTitle);
  const number = String(raw.number ?? raw.numero ?? 'DOC-00001').trim() || 'DOC-00001';
  const clientName = String(raw.clientName ?? raw.client_name ?? 'Client divers').trim() || 'Client divers';
  const issueDate = String(raw.issueDate ?? raw.issue_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const dueDateRaw = String(raw.dueDate ?? raw.due_date ?? '').slice(0, 10);
  const dueDate = dueDateRaw || (() => {
    const d = new Date(issueDate);
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const linesRaw = Array.isArray(raw.lines) ? raw.lines : [];
  const lines: SmartGeneratorLineItem[] = linesRaw
    .map((l) => (l && typeof l === 'object' ? computeLineItem(l as Record<string, unknown>) : null))
    .filter((l): l is SmartGeneratorLineItem => l !== null);

  if (!lines.length) return null;

  const amountHT = roundDgiAmount(lines.reduce((s, l) => s + l.amountHT, 0));
  const vatAmount = roundDgiAmount(lines.reduce((s, l) => s + l.vatAmount, 0));
  const totalTTC = roundDgiAmount(lines.reduce((s, l) => s + l.totalTTC, 0));
  const vatRatePercent = amountHT > 0 ? roundDgiAmount((vatAmount / amountHT) * 100) : 20;

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
    metadata: {
      smart_generator_chat: true,
      generated_at: new Date().toISOString(),
    },
  };
}

export function parseSmartGeneratorStructuredJson(text: string): SmartGeneratorDocument | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return aggregateStructuredDoc(parsed);
  } catch {
    return null;
  }
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
SOCIÉTÉ ÉMETTRICE:
- Raison sociale: ${h.raisonSociale}
- ICE: ${h.ice || '—'} | IF: ${h.if_fiscal || '—'} | RC: ${h.rc || '—'}
- Patente: ${h.patent || '—'} | CNSS: ${h.cnss || '—'}
- Adresse: ${h.adresse || '—'} ${h.ville || ''}
- Tél: ${h.telephone || '—'} | Email: ${h.email || '—'}
`
    : '\nAucune société pré-remplie — demande les coordonnées émettrice si nécessaire.\n';

  const draftBlock = params.documentDraft.trim()
    ? `\nDOCUMENT ACTUEL (${params.documentTitle}):\n---\n${params.documentDraft.trim()}\n---\n`
    : '\nAucun document pour le moment — l\'utilisateur peut en demander un nouveau.\n';

  const attachmentBlock = params.attachment?.textContent?.trim()
    ? `\nPIÈCE JOINTE ANALYSÉE (${params.attachment.filename}):\n---\n${params.attachment.textContent.trim()}\n---\nUtilise ce contenu pour digitaliser, formater ou générer le document officiel.\n`
    : '';

  return `Tu es l'assistant Smart Generator de Zafirix Atlas (Maroc) — expert en documents commerciaux et comptables.
Tu converses librement : factures, devis, bons de commande, reçus, bulletins de paie, lettres, grilles comptables, ou tout document métier sur demande.

${companyBlock}
${draftBlock}
${attachmentBlock}

Règles DGI Maroc:
- TVA autorisée: 0%, 7%, 10%, 14%, 20% uniquement
- Comptes PCGE: 3 à 8 chiffres
- Montants MAD, 2 décimales
- Mentions légales: ICE, IF, RC, Patente si disponibles

FORMAT DE RÉPONSE OBLIGATOIRE (trois sections, dans cet ordre exact):
${SG_CHAT_REPLY_MARKER}
[Message conversationnel court : ce que tu as fait, questions, rappels conformité]
${SG_CHAT_DOCUMENT_MARKER}
[Texte COMPLET du document formaté pour prévisualisation — en-tête société, client, tableau lignes, totaux HT/TVA/TTC. Pas de markdown. Document ENTIER à chaque modification.]
${SG_CHAT_STRUCTURED_MARKER}
[JSON valide UNIQUEMENT (sans markdown) pour export PDF/sauvegarde — schéma:
{
  "docType": "facture|devis|bon_commande|autre",
  "docTitle": "FACTURE",
  "customDocTitle": "",
  "number": "FAC-00001",
  "clientName": "Nom client",
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "lines": [
    { "description": "Libellé", "quantity": 1, "unit": "Pcs", "unitPriceHT": 1000, "vatRatePercent": 20, "pcgeAccount": "7111" }
  ]
}
Pour lettres ou documents non tabulaires, mets un JSON minimal avec docType "autre" et lines vide si non applicable.]

${ATLAS_AI_MULTILINGUAL_DARIJA}`;
}

export function buildSmartGeneratorChatMessages(params: SmartGeneratorChatRequest): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of params.history.slice(-20)) {
    if (!msg.content.trim()) continue;
    messages.push({ role: msg.role, content: msg.content.trim() });
  }

  let userContent = params.message.trim();
  if (params.attachment?.filename) {
    userContent = `${userContent}\n\n[J'ai joint « ${params.attachment.filename} » pour digitalisation ou intégration.]`.trim();
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

  return {
    reply: reply || 'Document mis à jour.',
    document,
    documentTitle: structured?.docTitle ?? fallbackTitle,
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

import type Anthropic from '@anthropic-ai/sdk';
import { ATLAS_AI_MULTILINGUAL_DARIJA } from '@/app/lib/atlas-ai-language';
import type { JuridiqueCompany } from '@/app/juridique/juridique-types';

export type JuridiqueChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type JuridiqueChatAttachment = {
  filename: string;
  mimeType: string;
  textContent: string;
  truncated?: boolean;
};

export type JuridiqueChatRequest = {
  message: string;
  history: JuridiqueChatMessage[];
  documentDraft: string;
  documentTitle: string;
  company?: JuridiqueCompany | null;
  attachment?: JuridiqueChatAttachment | null;
};

export type JuridiqueChatParsed = {
  reply: string;
  document: string;
  documentTitle: string;
};

export const JURIDIQUE_CHAT_REPLY_MARKER = '<<REPLY>>';
export const JURIDIQUE_CHAT_DOCUMENT_MARKER = '<<DOCUMENT>>';

export function buildJuridiqueChatSystemPrompt(params: {
  documentDraft: string;
  documentTitle: string;
  company?: JuridiqueCompany | null;
  attachment?: JuridiqueChatAttachment | null;
}): string {
  const companyBlock = params.company
    ? `
SOCIÉTÉ ACTIVE:
- Raison sociale: ${params.company.raisonSociale}
- Forme: ${params.company.formeJuridique}
- IF: ${params.company.if_fiscal || '—'} | ICE: ${params.company.ice || '—'} | RC: ${params.company.rc || '—'}
- Adresse: ${params.company.adresse} ${params.company.ville}
- Activité: ${params.company.activite || '—'}
`
    : '';

  const draftBlock = params.documentDraft.trim()
    ? `\nBROUILLON ACTUEL (${params.documentTitle || 'Document juridique'}):\n---\n${params.documentDraft.trim()}\n---\n`
    : '\nAucun brouillon pour le moment — l\'utilisateur peut demander la rédaction d\'un nouveau document.\n';

  const attachmentBlock = params.attachment?.textContent?.trim()
    ? `\nPIÈCE JOINTE ANALYSÉE (${params.attachment.filename}):\n---\n${params.attachment.textContent.trim()}\n---\nUtilise ce contenu comme référence pour rédiger, corriger ou fusionner avec le brouillon.\n`
    : '';

  return `Tu es un assistant juridique marocain expert (droit des sociétés, RC, contrats, PV, statuts SARL/SA).
Tu travailles en mode conversationnel : l'utilisateur peut demander des révisions itératives ("change le prix à 200k", "ajoute une clause de confidentialité", "réécris l'article 3", "supprime le paragraphe 2").

${companyBlock}
${draftBlock}
${attachmentBlock}

FORMAT DE RÉPONSE OBLIGATOIRE (deux sections, dans cet ordre exact):
${JURIDIQUE_CHAT_REPLY_MARKER}
[Message conversationnel court : ce que tu as fait, questions de clarification, rappel de validation par juriste]
${JURIDIQUE_CHAT_DOCUMENT_MARKER}
[Texte COMPLET du document juridique mis à jour — jamais un diff partiel. Si pas de document applicable, laisse cette section vide sauf une ligne vide.]

Règles de rédaction document:
- Français juridique professionnel marocain (ou arabe si l'utilisateur écrit en arabe)
- Articles numérotés, mentions "Fait à [ville], le [date]" si pertinent
- Conformité usages marocains (RC, IF, ICE, loi 5-96 / 17-95 selon forme)
- Pas de markdown, pas de tableaux ASCII, pas de HTML
- Chaque modification doit produire le document ENTIER mis à jour

Rappelle brièvement dans <<REPLY>> que le texte doit être validé par un juriste ou notaire habilité.

${ATLAS_AI_MULTILINGUAL_DARIJA}`;
}

export function buildJuridiqueChatMessages(params: JuridiqueChatRequest): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of params.history.slice(-20)) {
    if (!msg.content.trim()) continue;
    messages.push({ role: msg.role, content: msg.content.trim() });
  }

  let userContent = params.message.trim();
  if (params.attachment?.filename) {
    userContent = `${userContent}\n\n[J'ai joint le fichier « ${params.attachment.filename} » pour analyse et intégration au document.]`.trim();
  }
  messages.push({ role: 'user', content: userContent });
  return messages;
}

export function parseJuridiqueChatResponse(raw: string, fallbackTitle: string): JuridiqueChatParsed {
  const text = raw.trim();
  const docIdx = text.indexOf(JURIDIQUE_CHAT_DOCUMENT_MARKER);
  const replyIdx = text.indexOf(JURIDIQUE_CHAT_REPLY_MARKER);

  if (replyIdx !== -1 && docIdx !== -1 && docIdx > replyIdx) {
    const reply = text
      .slice(replyIdx + JURIDIQUE_CHAT_REPLY_MARKER.length, docIdx)
      .trim();
    const document = text.slice(docIdx + JURIDIQUE_CHAT_DOCUMENT_MARKER.length).trim();
    return { reply: reply || 'Document mis à jour.', document, documentTitle: fallbackTitle };
  }

  if (docIdx !== -1) {
    const reply = text.slice(0, docIdx).replace(JURIDIQUE_CHAT_REPLY_MARKER, '').trim();
    const document = text.slice(docIdx + JURIDIQUE_CHAT_DOCUMENT_MARKER.length).trim();
    return {
      reply: reply || 'Document mis à jour.',
      document,
      documentTitle: fallbackTitle,
    };
  }

  return {
    reply: text || 'Réponse vide.',
    document: '',
    documentTitle: fallbackTitle,
  };
}

/** Split streaming buffer into partial reply + partial document for live preview. */
export function splitJuridiqueStreamBuffer(buffer: string): { reply: string; document: string } {
  const docIdx = buffer.indexOf(JURIDIQUE_CHAT_DOCUMENT_MARKER);
  if (docIdx === -1) {
    const reply = buffer.replace(JURIDIQUE_CHAT_REPLY_MARKER, '').trimStart();
    return { reply, document: '' };
  }
  const replyStart = buffer.indexOf(JURIDIQUE_CHAT_REPLY_MARKER);
  const reply =
    replyStart !== -1
      ? buffer.slice(replyStart + JURIDIQUE_CHAT_REPLY_MARKER.length, docIdx).trimStart()
      : buffer.slice(0, docIdx).trimStart();
  const document = buffer.slice(docIdx + JURIDIQUE_CHAT_DOCUMENT_MARKER.length);
  return { reply, document };
}

/**
 * Server-side extraction of text/context from files uploaded to the AI assistant.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import { anthropicImageMediaType } from '@/app/lib/atlas-ocr';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';
import { renderPdfFirstPageToPng } from '@/app/lib/atlas-pdf-ocr-render';

const MAX_TEXT_CHARS = 48_000;
const ASSISTANT_DOC_SYSTEM = `Tu es un expert-comptable marocain. Extrais le contenu utile du document (texte, tableaux, chiffres clés).
Réponds en français avec:
1) Type de document détecté
2) Résumé structuré (tableaux en markdown si pertinent)
3) Montants, dates, ICE/IF si présents
Ne dépasse pas 4000 mots.`;

export type AssistantFileParseResult = {
  filename: string;
  mimeType: string;
  textContent: string;
  truncated: boolean;
};

function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_TEXT_CHARS)}\n\n[… contenu tronqué pour limite de contexte …]`,
    truncated: true,
  };
}

async function visionExtractDocument(imageBase64: string, mimeType: string, userHint: string): Promise<string> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return `[Fichier image/PDF — OCR non configuré (ANTHROPIC_API_KEY manquante). Nom: ${userHint}]`;
  }

  const mediaType = anthropicImageMediaType(mimeType);
  if (!mediaType) {
    return `[Type MIME non supporté pour l'analyse visuelle: ${mimeType}]`;
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: ASSISTANT_DOC_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBase64 },
        },
        { type: 'text', text: `Analyse ce document pour un cabinet comptable marocain. Contexte utilisateur: ${userHint}` },
      ],
    }],
  });

  const block = response.content.find((b) => b.type === 'text');
  return block && block.type === 'text' ? block.text : '';
}

function parseSpreadsheet(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames.slice(0, 5)) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';' });
    parts.push(`## Feuille: ${sheetName}\n${csv}`);
  }
  return parts.join('\n\n');
}

export async function parseAssistantUploadedFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  userHint: string,
): Promise<AssistantFileParseResult> {
  const lower = filename.toLowerCase();
  let rawText = '';

  if (
    mimeType.includes('csv') ||
    mimeType.includes('text/plain') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.txt')
  ) {
    rawText = buffer.toString('utf-8');
  } else if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls')
  ) {
    rawText = parseSpreadsheet(buffer);
  } else if (mimeType.includes('pdf') || lower.endsWith('.pdf')) {
    try {
      const png = await renderPdfFirstPageToPng(buffer);
      rawText = await visionExtractDocument(png.toString('base64'), 'image/png', userHint);
    } catch {
      rawText = `[PDF — extraction impossible. Fichier: ${filename}]`;
    }
  } else if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(lower)) {
    rawText = await visionExtractDocument(buffer.toString('base64'), mimeType, userHint);
  } else {
    rawText = `[Fichier ${filename} (${mimeType}) — type non entièrement supporté. Taille: ${buffer.length} octets.]`;
  }

  const { text, truncated } = truncateText(rawText.trim() || `[Contenu vide pour ${filename}]`);
  return { filename, mimeType, textContent: text, truncated };
}

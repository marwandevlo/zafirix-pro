/**
 * Server-side invoice OCR via Anthropic (Documents IA).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AtlasOcrExtraction } from '@/app/types/atlas-document';
import { anthropicImageMediaType, OCR_PROVIDER, parseOcrJsonResponse } from '@/app/lib/atlas-ocr';
import { parseAnthropicOcrError } from '@/app/lib/atlas-ocr-image-prep';
import { getAnthropicApiKey } from '@/app/lib/anthropic-env';

const OCR_SYSTEM = `Tu es un expert en extraction de données de factures marocaines.
Extrais les informations en JSON avec ces champs exactement:
{
  "numero_facture": "...",
  "date": "...",
  "fournisseur": "...",
  "montant_ht": 0,
  "taux_tva": 20,
  "montant_tva": 0,
  "montant_ttc": 0,
  "description": "..."
}
Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.`;

export type InvoiceOcrSuccess = {
  ok: true;
  extraction: AtlasOcrExtraction;
  raw: string;
  provider: typeof OCR_PROVIDER;
};

export type InvoiceOcrFailure = {
  ok: false;
  step: string;
  code: string;
  message: string;
  provider: typeof OCR_PROVIDER;
};

export async function runInvoiceOcrExtraction(
  imageBase64: string,
  mimeType: string,
): Promise<InvoiceOcrSuccess | InvoiceOcrFailure> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return {
      ok: false,
      step: 'auth',
      code: 'ocr_not_configured',
      message: 'ANTHROPIC_API_KEY missing',
      provider: OCR_PROVIDER,
    };
  }

  const mediaType = anthropicImageMediaType(mimeType);
  if (!mediaType) {
    return {
      ok: false,
      step: 'mime_validate',
      code: 'mime_not_supported',
      message: `Unsupported OCR mime type: ${mimeType}`,
      provider: OCR_PROVIDER,
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: OCR_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          { type: 'text', text: 'Extrais les données de cette facture en JSON.' },
        ],
      }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (!text.trim()) {
      return {
        ok: false,
        step: 'ai_provider',
        code: 'empty_response',
        message: 'OCR provider returned empty response',
        provider: OCR_PROVIDER,
      };
    }

    try {
      const extraction = parseOcrJsonResponse(text);
      return { ok: true, extraction, raw: text, provider: OCR_PROVIDER };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'json_parse_failed';
      return {
        ok: false,
        step: 'json_parse',
        code: 'json_parse_failed',
        message,
        provider: OCR_PROVIDER,
      };
    }
  } catch (err) {
    const parsed = parseAnthropicOcrError(err);
    return {
      ok: false,
      step: 'ai_provider',
      code: parsed.code,
      message: parsed.message,
      provider: OCR_PROVIDER,
    };
  }
}

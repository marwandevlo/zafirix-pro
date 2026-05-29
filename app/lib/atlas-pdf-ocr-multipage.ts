/**
 * Multi-page PDF OCR pipeline for Documents IA.
 */

import { pdf } from 'pdf-to-img';
import type { AtlasOcrDetectedInvoice, AtlasOcrError, AtlasOcrExtraction } from '@/app/types/atlas-document';
import { preparePdfPageForOcr } from '@/app/lib/atlas-ocr-image-prep';
import { runInvoiceOcrExtraction } from '@/app/lib/atlas-ocr-invoice-server';
import {
  buildDetectedInvoicesFromPageResults,
  summaryExtractionFromInvoices,
} from '@/app/lib/atlas-ocr-invoices-detect';
import {
  destroyPdfDocument,
  PDF_OCR_MAX_PAGES,
  PDF_OCR_PAGE_TIMEOUT_MS,
  PDF_OCR_RENDER_SCALE,
  PDF_OCR_ROUTE_TIMEOUT_MS,
} from '@/app/lib/atlas-pdf-ocr-render';

export type AtlasOcrPageMeta = {
  page_number: number;
  rendered_image_size: number;
  rendered_image_mime_type: string;
  success: boolean;
  error?: AtlasOcrError;
  extraction?: AtlasOcrExtraction;
};

export type MultiPagePdfOcrResult = {
  totalPages: number;
  processedPages: number;
  pageResults: AtlasOcrPageMeta[];
  invoices: AtlasOcrDetectedInvoice[];
  merged: AtlasOcrExtraction;
  processingStatus: 'processed' | 'failed';
  partialFailure: boolean;
  renderedMime: 'image/jpeg' | 'image/png';
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function firstNonEmptyString(extractions: AtlasOcrExtraction[], key: keyof AtlasOcrExtraction): string | undefined {
  for (const e of extractions) {
    const v = e[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Merge per-page extractions: dedupe header fields, prefer highest TTC for totals. */
export function mergeOcrExtractions(extractions: AtlasOcrExtraction[]): AtlasOcrExtraction {
  if (!extractions.length) return {};

  let bestTotals = extractions[0];
  for (const e of extractions) {
    const ttc = e.montant_ttc ?? 0;
    const bestTtc = bestTotals.montant_ttc ?? 0;
    if (ttc > bestTtc || (ttc === bestTtc && (e.montant_ht ?? 0) > (bestTotals.montant_ht ?? 0))) {
      bestTotals = e;
    }
  }

  const descriptions = extractions
    .map((e) => e.description?.trim())
    .filter((d): d is string => Boolean(d))
    .filter((d, i, arr) => arr.indexOf(d) === i);

  return {
    numero_facture: firstNonEmptyString(extractions, 'numero_facture'),
    fournisseur: firstNonEmptyString(extractions, 'fournisseur'),
    date: firstNonEmptyString(extractions, 'date'),
    montant_ht: bestTotals.montant_ht,
    montant_tva: bestTotals.montant_tva,
    montant_ttc: bestTotals.montant_ttc,
    taux_tva: bestTotals.taux_tva,
    description: descriptions.length ? descriptions.join(' | ') : undefined,
  };
}

export type PdfOcrProgressEvent = {
  phase: 'rendering' | 'analyzing';
  pageNumber: number;
  totalPages: number;
};

export async function processMultiPagePdfOcr(
  pdfBytes: Buffer,
  opts?: { onProgress?: (event: PdfOcrProgressEvent) => void | Promise<void> },
): Promise<MultiPagePdfOcrResult> {
  const deadline = Date.now() + PDF_OCR_ROUTE_TIMEOUT_MS;
  const document = await pdf(pdfBytes, { scale: PDF_OCR_RENDER_SCALE });

  try {
    const totalPages = document.length;
    if (!totalPages) {
      throw new Error('PDF has no pages');
    }

    const pagesToProcess = Math.min(totalPages, PDF_OCR_MAX_PAGES);
    const pageResults: AtlasOcrPageMeta[] = [];
    let lastRenderedMime: 'image/jpeg' | 'image/png' = 'image/png';

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      if (Date.now() >= deadline) {
        pageResults.push({
          page_number: pageNum,
          rendered_image_size: 0,
          rendered_image_mime_type: lastRenderedMime,
          success: false,
          error: {
            step: 'timeout',
            code: 'ocr_timeout',
            message: `Document OCR timed out before page ${pageNum}`,
          },
        });
        continue;
      }

      try {
        await opts?.onProgress?.({ phase: 'rendering', pageNumber: pageNum, totalPages: pagesToProcess });
        const pngBuffer = await document.getPage(pageNum);
        const prepared = await preparePdfPageForOcr(pngBuffer);
        lastRenderedMime = prepared.mimeType;

        const remaining = Math.max(5_000, deadline - Date.now());
        const pageTimeout = Math.min(PDF_OCR_PAGE_TIMEOUT_MS, remaining);

        await opts?.onProgress?.({ phase: 'analyzing', pageNumber: pageNum, totalPages: pagesToProcess });
        const ocrResult = await withTimeout(
          runInvoiceOcrExtraction(prepared.buffer.toString('base64'), prepared.mimeType),
          pageTimeout,
          `page ${pageNum} OCR`,
        );

        if (ocrResult.ok) {
          pageResults.push({
            page_number: pageNum,
            rendered_image_size: prepared.preparedBytes,
            rendered_image_mime_type: prepared.mimeType,
            success: true,
            extraction: ocrResult.extraction,
          });
        } else {
          pageResults.push({
            page_number: pageNum,
            rendered_image_size: prepared.preparedBytes,
            rendered_image_mime_type: prepared.mimeType,
            success: false,
            error: {
              step: ocrResult.step,
              code: ocrResult.code,
              message: ocrResult.message,
            },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'pdf_page_failed';
        const code = message.includes('timed out') ? 'ocr_timeout' : 'pdf_render_failed';
        pageResults.push({
          page_number: pageNum,
          rendered_image_size: 0,
          rendered_image_mime_type: lastRenderedMime,
          success: false,
          error: {
            step: code === 'ocr_timeout' ? 'timeout' : 'pdf_render',
            code,
            message,
          },
        });
      }
    }

    const invoices = buildDetectedInvoicesFromPageResults(pageResults);
    const merged = summaryExtractionFromInvoices(invoices);
    const successCount = pageResults.filter((p) => p.success).length;
    const partialFailure = successCount > 0 && successCount < pageResults.length;

    return {
      totalPages,
      processedPages: pagesToProcess,
      pageResults,
      invoices,
      merged,
      processingStatus: successCount > 0 ? 'processed' : 'failed',
      partialFailure,
      renderedMime: lastRenderedMime,
    };
  } finally {
    await destroyPdfDocument(document);
  }
}

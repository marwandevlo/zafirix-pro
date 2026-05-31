/**
 * Server-side PDF rendering for Documents IA OCR (pdf-to-img / pdfjs-dist).
 */

import { ensureAtlasDomPolyfills } from '@/app/lib/atlas-dom-polyfill';

ensureAtlasDomPolyfills();

import { pdf } from 'pdf-to-img';

export const PDF_OCR_RENDER_SCALE = 1.5;
export const PDF_OCR_RENDERED_MIME = 'image/png' as const;
/** Large accounting PDFs — process sequentially with progress updates. */
export const PDF_OCR_MAX_PAGES = 50;
export const PDF_OCR_ROUTE_TIMEOUT_MS = 280_000;
export const PDF_OCR_PAGE_TIMEOUT_MS = 60_000;

type PdfDocument = Awaited<ReturnType<typeof pdf>>;

export async function destroyPdfDocument(document: PdfDocument): Promise<void> {
  if (typeof document.destroy === 'function') {
    await document.destroy();
  }
}

/** Page count without rendering (for OCR progress metadata). */
export async function getPdfPageCount(pdfBytes: Buffer): Promise<number> {
  const document = await pdf(pdfBytes, { scale: PDF_OCR_RENDER_SCALE });
  try {
    return document.length;
  } finally {
    await destroyPdfDocument(document);
  }
}

export async function renderPdfFirstPageToPng(pdfBytes: Buffer): Promise<Buffer> {
  const document = await pdf(pdfBytes, { scale: PDF_OCR_RENDER_SCALE });
  try {
    if (!document.length) {
      throw new Error('PDF has no pages');
    }
    return await document.getPage(1);
  } finally {
    await destroyPdfDocument(document);
  }
}

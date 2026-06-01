/**
 * Server-side PDF rendering for Documents IA OCR (pdf-to-img / pdfjs-dist).
 * pdf-to-img is loaded dynamically after DOM polyfills (static import hoists before polyfill).
 */

import { ensureAtlasDomPolyfills } from '@/app/lib/atlas-dom-polyfill';

export const PDF_OCR_RENDER_SCALE = 1.5;
export const PDF_OCR_RENDERED_MIME = 'image/png' as const;
/** Large accounting PDFs — process sequentially with progress updates. */
export const PDF_OCR_MAX_PAGES = 50;
export const PDF_OCR_ROUTE_TIMEOUT_MS = 280_000;
export const PDF_OCR_PAGE_TIMEOUT_MS = 60_000;

type PdfFn = typeof import('pdf-to-img').pdf;
type PdfDocument = Awaited<ReturnType<PdfFn>>;

let pdfLoader: Promise<PdfFn> | null = null;

async function loadPdfRenderer(): Promise<PdfFn> {
  ensureAtlasDomPolyfills();
  if (!pdfLoader) {
    pdfLoader = import('pdf-to-img').then((mod) => mod.pdf);
  }
  return pdfLoader;
}

export async function destroyPdfDocument(document: PdfDocument): Promise<void> {
  if (typeof document.destroy === 'function') {
    await document.destroy();
  }
}

/** Page count without rendering (for OCR progress metadata). */
export async function getPdfPageCount(pdfBytes: Buffer): Promise<number> {
  const pdf = await loadPdfRenderer();
  const document = await pdf(pdfBytes, { scale: PDF_OCR_RENDER_SCALE });
  try {
    return document.length;
  } finally {
    await destroyPdfDocument(document);
  }
}

export async function renderPdfFirstPageToPng(pdfBytes: Buffer): Promise<Buffer> {
  const pdf = await loadPdfRenderer();
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

/** Open a PDF for multi-page iteration (caller must destroy). */
export async function openPdfDocument(pdfBytes: Buffer): Promise<PdfDocument> {
  const pdf = await loadPdfRenderer();
  return pdf(pdfBytes, { scale: PDF_OCR_RENDER_SCALE });
}

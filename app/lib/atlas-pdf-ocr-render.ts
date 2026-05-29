/**
 * Server-side PDF rendering for Documents IA OCR (pdf-to-img / pdfjs-dist).
 */

import { pdf } from 'pdf-to-img';

export const PDF_OCR_RENDER_SCALE = 1.5;
export const PDF_OCR_RENDERED_MIME = 'image/png' as const;
export const PDF_OCR_MAX_PAGES = 10;
export const PDF_OCR_ROUTE_TIMEOUT_MS = 180_000;
export const PDF_OCR_PAGE_TIMEOUT_MS = 45_000;

type PdfDocument = Awaited<ReturnType<typeof pdf>>;

export async function destroyPdfDocument(document: PdfDocument): Promise<void> {
  if (typeof document.destroy === 'function') {
    await document.destroy();
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

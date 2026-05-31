/**
 * pdf-to-img / pdfjs-dist require browser globals on Node (Vercel serverless).
 */
import DOMMatrixPolyfill from '@thednp/dommatrix';

export function ensureAtlasDomPolyfills(): void {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = DOMMatrixPolyfill as unknown as typeof DOMMatrix;
  }
}

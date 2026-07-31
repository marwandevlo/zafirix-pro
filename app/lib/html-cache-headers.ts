import { NextResponse } from 'next/server';

/** Force browsers and Vercel CDN to revalidate HTML document shells every request. */
export const HTML_NO_STORE_HEADER_VALUES = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
} as const;

export function isHtmlDocumentPath(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/_next/')) return false;
  const last = pathname.split('/').pop() ?? '';
  if (last.includes('.')) return false;
  return true;
}

export function applyHtmlNoStoreHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(HTML_NO_STORE_HEADER_VALUES)) {
    response.headers.set(key, value);
  }
  return response;
}

export function finalizeHtmlDocumentResponse(response: NextResponse, pathname: string): NextResponse {
  if (!isHtmlDocumentPath(pathname)) return response;
  return applyHtmlNoStoreHeaders(response);
}

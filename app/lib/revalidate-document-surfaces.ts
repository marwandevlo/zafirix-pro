import { revalidateCompanySurfaces } from '@/app/lib/revalidate-company-surfaces';

/** Invalidate cached surfaces after document OCR, validation, or cross-module posting. */
export function revalidateDocumentSurfaces(extraPaths: string[] = []): void {
  revalidateCompanySurfaces(undefined, extraPaths);
}

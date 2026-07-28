import { revalidatePath } from 'next/cache';

/** Invalidate cached surfaces after document OCR, validation, or cross-module posting. */
export function revalidateDocumentSurfaces(extraPaths: string[] = []): void {
  revalidatePath('/documents');
  revalidatePath('/tva');
  revalidatePath('/comptabilite');
  revalidatePath('/declarations');
  revalidatePath('/dashboard');

  for (const path of extraPaths) {
    if (path.startsWith('/')) revalidatePath(path);
  }
}

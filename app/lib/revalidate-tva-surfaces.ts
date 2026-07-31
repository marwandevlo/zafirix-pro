import { revalidatePath } from 'next/cache';

/** Invalidate cached TVA surfaces after supplier identity or suggestion mutations. */
export function revalidateTvaSurfaces(_companyId?: string): void {
  revalidatePath('/tva');
  revalidatePath('/declarations');
  revalidatePath('/comptabilite');
}

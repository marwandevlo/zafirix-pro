import { revalidateCompanySurfaces } from '@/app/lib/revalidate-company-surfaces';

/** Invalidate cached TVA surfaces after supplier identity or suggestion mutations. */
export function revalidateTvaSurfaces(companyId?: string): void {
  revalidateCompanySurfaces(companyId);
}

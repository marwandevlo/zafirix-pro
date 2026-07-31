import { revalidatePath } from 'next/cache';

/** Next.js 16 route handlers — disable fetch caching for live workspace data. */
export const ATLAS_MUTATION_FETCH = { cache: 'no-store' as const };

const COMPANY_SURFACE_PATHS = [
  '/documents',
  '/factures',
  '/tva',
  '/comptabilite',
  '/declarations',
  '/dashboard',
  '/validation',
] as const;

/** Invalidate all cached app surfaces after any company-scoped mutation. */
export function revalidateCompanySurfaces(_companyId?: string, extraPaths: string[] = []): void {
  for (const path of COMPANY_SURFACE_PATHS) {
    revalidatePath(path);
  }
  for (const path of extraPaths) {
    if (path.startsWith('/')) revalidatePath(path);
  }
}

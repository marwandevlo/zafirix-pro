import { revalidatePath } from 'next/cache';

/** Invalidate cached admin + app surfaces after privileged writes. */
export function revalidateAdminSurfaces(extraPaths: string[] = []): void {
  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/users');
  revalidatePath('/dashboard');
  revalidatePath('/');

  for (const path of extraPaths) {
    if (path.startsWith('/')) revalidatePath(path);
  }
}

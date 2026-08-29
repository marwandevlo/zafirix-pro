/**
 * Canonical site origin for Supabase auth redirects (password reset, etc.).
 * Always https://zafirixpro.com in production — never *.vercel.app.
 */
import { getPublicAppUrl } from '@/app/lib/atlas-app-url';

export function getAuthSiteUrl(): string {
  return getPublicAppUrl();
}

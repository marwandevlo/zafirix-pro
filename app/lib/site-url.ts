/**
 * Canonical site origin for Supabase auth redirects (password reset, etc.).
 * Delegates to atlas-app-url for a single source of truth.
 */
import { getPublicAppUrl } from '@/app/lib/atlas-app-url';

export function getAuthSiteUrl(): string {
  return getPublicAppUrl();
}

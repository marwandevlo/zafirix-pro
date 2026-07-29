/**
 * Sprint 0 — explicit opt-in for unsafe demo routes (never on by default in production).
 */

const truthy = (v: string | undefined) => v === 'true' || v === '1';

/** Mock client portal — explicit opt-in; auto-enabled in development when Supabase backend is active. */
export function isClientPortalDemoEnabled(): boolean {
  if (truthy(process.env.NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO)) return true;
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ATLAS_DATA_BACKEND === 'supabase') {
    return true;
  }
  return false;
}

/** Production client portal bridge (upload → validation queue). */
export function isClientPortalBridgeEnabled(): boolean {
  if (truthy(process.env.NEXT_PUBLIC_ENABLE_CLIENT_PORTAL)) return true;
  return isClientPortalDemoEnabled();
}

/** Server-side demo portal code (default 1234). */
export function clientPortalDemoCode(): string {
  return process.env.CLIENT_PORTAL_DEMO_CODE?.trim() || '1234';
}

/** localStorage-based admin role — development only; never trusted in production builds. */
export function isLocalDevAdminEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN === 'true';
}

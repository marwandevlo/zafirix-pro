/**
 * Sprint 0 — feature flags for client portal and local dev tooling.
 */

const truthy = (v: string | undefined) => v === 'true' || v === '1';
const falsy = (v: string | undefined) => v === 'false' || v === '0';

/** Mock client portal demo affordances — explicit opt-in; auto-enabled in local Supabase dev. */
export function isClientPortalDemoEnabled(): boolean {
  if (truthy(process.env.NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO)) return true;
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ATLAS_DATA_BACKEND === 'supabase') {
    return true;
  }
  return false;
}

/**
 * Production client portal bridge (upload → validation queue).
 * Enabled by default; set NEXT_PUBLIC_ENABLE_CLIENT_PORTAL=false to disable.
 */
export function isClientPortalBridgeEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ENABLE_CLIENT_PORTAL?.trim();
  if (falsy(flag)) return false;
  if (truthy(flag)) return true;
  return true;
}

/**
 * Server-side demo portal code.
 * Default `1234` only in development / when demo mode is explicitly enabled.
 * Production never falls back to a hardcoded PIN.
 */
export function clientPortalDemoCode(): string {
  const configured = process.env.CLIENT_PORTAL_DEMO_CODE?.trim();
  if (configured) return configured;
  if (isClientPortalDemoEnabled()) return '1234';
  return '';
}

/** localStorage-based admin role — development only; never trusted in production builds. */
export function isLocalDevAdminEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN === 'true';
}

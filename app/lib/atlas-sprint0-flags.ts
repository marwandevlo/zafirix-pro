/**
 * Sprint 0 — explicit opt-in for unsafe demo routes (never on by default in production).
 */

/** Mock client portal — explicit opt-in only (never enabled by default). */
export function isClientPortalDemoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO === 'true';
}

/** Production client portal bridge (upload → validation queue). */
export function isClientPortalBridgeEnabled(): boolean {
  return (
    isClientPortalDemoEnabled() ||
    process.env.NEXT_PUBLIC_ENABLE_CLIENT_PORTAL === 'true'
  );
}

/** localStorage-based admin role — development only; never trusted in production builds. */
export function isLocalDevAdminEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN === 'true';
}

/**
 * Data backend: `local` uses browser localStorage for **non-production** demos only.
 * `NODE_ENV === 'production'` always uses Supabase (canonical persistence).
 */
export function atlasDataBackend(): 'local' | 'supabase' {
  // Playwright E2E (`next start` on port 3001) — localStorage demo, no Supabase auth gate.
  if (
    process.env.ATLAS_E2E_LOCAL === 'true' ||
    process.env.NEXT_PUBLIC_ATLAS_E2E_LOCAL === 'true'
  ) {
    return 'local';
  }

  // Production must never run in demo/local mode.
  // If the env var is missing/misconfigured in production, force Supabase to avoid
  // exposing private app routes to unauthenticated visitors.
  if (process.env.NODE_ENV === 'production') return 'supabase';

  const v = (process.env.NEXT_PUBLIC_ATLAS_DATA_BACKEND ?? 'local').toLowerCase();
  return v === 'supabase' ? 'supabase' : 'local';
}

export function isAtlasSupabaseDataEnabled(): boolean {
  return atlasDataBackend() === 'supabase';
}

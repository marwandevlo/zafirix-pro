'use client';

import { useEffect } from 'react';

/**
 * Recovery links often land on `/#access_token=…&type=recovery`.
 * Move them to `/reset-password` so the reset UI can finish the session.
 *
 * Confirm-signup should use `/auth/callback?token_hash=…&type=signup` (see email template).
 * If a legacy signup hash lands on `/`, the browser Supabase client (`detectSessionInUrl`) handles it.
 */
export function RecoveryHashRedirectScript() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash || '';
    const pathname = window.location.pathname || '';

    if (!hash) return;
    if (pathname === '/reset-password') return;
    if (pathname.startsWith('/auth/')) return;

    if (hash.includes('access_token=') && hash.includes('type=recovery')) {
      window.location.replace(`/reset-password${hash}`);
    }
  }, []);

  return null;
}

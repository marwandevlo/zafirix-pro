'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';

const PING_INTERVAL_MS = 2 * 60 * 1000;
const PAGE_LOG_COOLDOWN_MS = 10 * 60 * 1000;

const SKIP_PREFIXES = ['/login', '/signup', '/auth', '/access-denied'];

function shouldSkipPath(path: string): boolean {
  return SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Keeps profiles.last_seen_at fresh and optionally logs page views (throttled).
 * Mounted once in the root layout for all authenticated sessions.
 */
export function UserPresencePing() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);
  const lastPageLogRef = useRef<number>(0);

  useEffect(() => {
    if (!isAtlasSupabaseDataEnabled()) return;
    if (shouldSkipPath(pathname)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = async (opts?: { logPage?: boolean }) => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? '';
        if (!token || cancelled) return;

        await fetch('/api/activity/ping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            path: pathname,
            logPage: opts?.logPage === true,
          }),
          cache: 'no-store',
        });
      } catch {
        // Non-blocking presence ping
      }
    };

    const maybeLogPage = () => {
      const now = Date.now();
      const pathChanged = lastPathRef.current !== pathname;
      lastPathRef.current = pathname;
      if (pathChanged && now - lastPageLogRef.current >= PAGE_LOG_COOLDOWN_MS) {
        lastPageLogRef.current = now;
        void ping({ logPage: true });
        return;
      }
      void ping();
    };

    void maybeLogPage();
    timer = setInterval(() => void ping(), PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [pathname]);

  return null;
}

/**
 * Authoritative profiles.status reads for server contexts (middleware, API routes).
 * Prefer service_role; fall back to authenticated session client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import {
  normalizeStatus,
  type AuthoritativeStatusReadResult,
  type AuthoritativeStatusReadSource,
  type ProfileStatus,
} from '@/app/types/auth';

export type { AuthoritativeStatusReadResult, AuthoritativeStatusReadSource };

let missingServiceRoleWarned = false;

export function getSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
}

export function warnIfMissingServiceRoleKey(context: string): boolean {
  const key = getSupabaseServiceRoleKey();
  if (key) return true;

  if (!missingServiceRoleWarned) {
    console.error(
      `[auth] SUPABASE_SERVICE_ROLE_KEY is not set (${context}). ` +
        'Profile status enforcement falls back to the session client and may be stale under RLS.',
    );
    missingServiceRoleWarned = true;
  }
  return false;
}

export function createServiceRoleClient(supabaseUrl: string): SupabaseClient | null {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function readAuthoritativeProfileStatus(
  userId: string,
  options: {
    supabaseUrl: string;
    sessionClient?: SupabaseClient;
    context?: string;
  },
): Promise<AuthoritativeStatusReadResult> {
  const context = options.context ?? 'readAuthoritativeProfileStatus';
  const admin = createServiceRoleClient(options.supabaseUrl);

  if (!admin) {
    warnIfMissingServiceRoleKey(context);
  } else {
    try {
      const { data, error } = await admin
        .from('profiles')
        .select('status')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn(`[auth] service_role status read failed (${context}):`, error.message);
      } else {
        const raw = String((data as { status?: string | null } | null)?.status ?? '').trim();
        if (raw) {
          const normalized: ProfileStatus = normalizeStatus(raw);
          return { raw, normalized, source: 'service_role', error: null };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[auth] service_role exception (${context}):`, message);
    }
  }

  if (options.sessionClient) {
    try {
      const { data, error } = await options.sessionClient
        .from('profiles')
        .select('status')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        return { raw: null, normalized: null, source: 'none', error: error.message };
      }

      const raw = String((data as { status?: string | null } | null)?.status ?? '').trim();
      const normalized: ProfileStatus | null = raw ? normalizeStatus(raw) : null;
      return { raw: raw || null, normalized, source: 'session', error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { raw: null, normalized: null, source: 'none', error: message };
    }
  }

  return { raw: null, normalized: null, source: 'none', error: 'no_read_path' };
}

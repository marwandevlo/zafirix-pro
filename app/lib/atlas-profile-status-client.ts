/**
 * Client-side authoritative profile status fetch.
 *
 * Resolution order:
 * 1. GET /api/profile  (server service-role read — source of truth)
 * 2. Direct Supabase RLS read (fallback only when API unavailable)
 */

import { supabase } from '@/app/lib/supabase';
import {
  normalizeStatus,
  type ProfileStatus,
  type ProfileStatusFetchResult,
} from '@/app/types/auth';

export type { ProfileStatusFetchResult };

async function fetchStatusFromApi(accessToken: string): Promise<ProfileStatus | null> {
  try {
    const res = await fetch('/api/profile', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `http_${res.status}`);
    }

    const json = (await res.json()) as { profile?: { status?: string | null } };
    const raw = json.profile?.status;
    if (raw == null || String(raw).trim() === '') return null;
    return normalizeStatus(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[fetchSessionProfileStatus] /api/profile failed:', message);
    return null;
  }
}

async function fetchStatusFromRls(userId: string): Promise<ProfileStatus | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[fetchSessionProfileStatus] RLS read failed:', error.message);
      return null;
    }

    const raw = String((data as { status?: string | null } | null)?.status ?? '').trim();
    if (!raw) return null;
    return normalizeStatus(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[fetchSessionProfileStatus] RLS exception:', message);
    return null;
  }
}

/**
 * Fetch normalized profile status for the signed-in user.
 * Call immediately after `supabase.auth.refreshSession()` on login.
 */
export async function fetchSessionProfileStatus(): Promise<ProfileStatusFetchResult> {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return { status: null, source: 'none', error: sessionError.message };
    }

    const token = sessionData.session?.access_token ?? '';
    const userId = sessionData.session?.user?.id ?? '';

    if (!userId) {
      return { status: null, source: 'none', error: 'no_session' };
    }

    if (token) {
      const fromApi = await fetchStatusFromApi(token);
      if (fromApi) {
        return { status: fromApi, source: 'api', error: null };
      }
    }

    const fromRls = await fetchStatusFromRls(userId);
    if (fromRls) {
      return { status: fromRls, source: 'rls', error: null };
    }

    return { status: null, source: 'none', error: 'status_unavailable' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: null, source: 'none', error: message };
  }
}

/** Convenience wrapper returning status only. */
export async function fetchSessionProfileStatusValue(): Promise<ProfileStatus | null> {
  const result = await fetchSessionProfileStatus();
  return result.status;
}

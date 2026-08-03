import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';

/** Resolve bearer token for admin API calls — throws with a user-visible message on failure. */
export async function fetchAdminBearerToken(): Promise<string> {
  if (!isAtlasSupabaseDataEnabled()) {
    throw new Error('Mode Supabase requis pour les actions admin.');
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  if (!token) {
    throw new Error('Session expirée — reconnectez-vous pour continuer.');
  }
  return token;
}

/** Authenticated admin fetch with JSON content-type when a body is present. */
export async function adminAuthedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await fetchAdminBearerToken();
  const headers = new Headers(init?.headers ?? undefined);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(path, {
    ...init,
    cache: 'no-store',
    headers,
  });
}

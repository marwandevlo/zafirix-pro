import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';

export type AgentsRouteContext =
  | { ok: true; userId: string; db: SupabaseClient }
  | { ok: false; status: number; error: string };

/** User-scoped Supabase client for Agents API routes (RLS via session JWT). */
export async function requireAgentsRouteDb(request: NextRequest): Promise<AgentsRouteContext> {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return { ok: false, status: session.status, error: session.code };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, status: 503, error: 'misconfigured' };
  }

  const auth = request.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const { createServerClient } = await import('@supabase/ssr');

  const db = bearer
    ? createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      })
    : createServerClient(url, anonKey, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      });

  return { ok: true, userId: session.userId, db };
}

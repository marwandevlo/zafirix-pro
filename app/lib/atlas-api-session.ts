import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

type Ok = { ok: true; userId: string };
type Err = { ok: false; status: 401 | 500; code: 'missing_session' | 'invalid_token' | 'misconfigured' };

/**
 * Resolves the current user from Supabase session cookies (preferred) or
 * `Authorization: Bearer <access_token>` (same pattern as `/api/search`).
 */
export async function requireAtlasSupabaseSession(request: NextRequest): Promise<Ok | Err> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, status: 500, code: 'misconfigured' };
  }

  const cookieStore = await cookies();
  const supabaseCookies = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* session refresh handled in middleware */
        }
      },
    },
  });

  const { data: cookieUser } = await supabaseCookies.auth.getUser();
  if (cookieUser.user) {
    return { ok: true, userId: cookieUser.user.id };
  }

  const auth = request.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) {
    return { ok: false, status: 401, code: 'missing_session' };
  }

  const supabaseBearer = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: bearerUser, error } = await supabaseBearer.auth.getUser();
  if (error || !bearerUser.user) {
    return { ok: false, status: 401, code: 'invalid_token' };
  }

  return { ok: true, userId: bearerUser.user.id };
}

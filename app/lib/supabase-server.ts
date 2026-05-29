import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { isAtlasOwnerEmail, isJwtAppMetadataAdmin } from '@/app/lib/admin/atlas-admin-access';

export async function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In server components, setting cookies may be a no-op depending on runtime.
        // Route handlers and middleware should handle writing cookies.
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // ignore
          }
        }
      },
    },
  });
}

export async function getServerUser() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Sync-only hint (JWT admin or owner email). For full checks including `profiles.role`, use `isAtlasAdminUser`. */
export function isAdminFromUser(user: { app_metadata?: Record<string, unknown>; email?: string | null } | null): boolean {
  if (!user) return false;
  return isJwtAppMetadataAdmin(user) || isAtlasOwnerEmail(user.email);
}


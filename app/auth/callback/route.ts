import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/app/lib/atlas-profile-status-server';
import { ensureUserProfile } from '@/app/lib/ensure-user-profile';

const DEFAULT_NEXT = '/dashboard';

function safeNextPath(raw: string | null): string {
  const next = String(raw ?? '').trim() || DEFAULT_NEXT;
  if (!next.startsWith('/') || next.startsWith('//')) return DEFAULT_NEXT;
  return next;
}

function redirectWithCookies(request: NextRequest, url: string, response: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie.name, cookie.value);
  }
  return redirect;
}

/**
 * Auth callback for:
 * - Email confirm (token_hash + type=signup) — Confirm Signup template
 * - PKCE OAuth / magic-link code exchange (?code=…)
 *
 * Sets session cookies via @supabase/ssr, ensures profiles row, redirects into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(searchParams.get('next'));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[auth/callback] missing Supabase public env');
    return NextResponse.redirect(`${origin}/login?error=auth_misconfigured`);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (error) {
        console.error('[auth/callback] verifyOtp failed', { type, message: error.message });
        return NextResponse.redirect(
          `${origin}/login?error=auth_callback_failed&reason=${encodeURIComponent(error.message)}`,
        );
      }
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('[auth/callback] exchangeCodeForSession failed', { message: error.message });
        return NextResponse.redirect(
          `${origin}/login?error=auth_callback_failed&reason=${encodeURIComponent(error.message)}`,
        );
      }
    } else {
      console.warn('[auth/callback] missing code/token_hash', {
        keys: Array.from(searchParams.keys()),
      });
      return NextResponse.redirect(`${origin}/login?error=auth_callback_missing_params`);
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      console.error('[auth/callback] getUser after exchange failed', userError?.message);
      return redirectWithCookies(request, `${origin}/login?error=auth_callback_no_user`, response);
    }

    const admin = createServiceRoleClient(supabaseUrl);
    if (admin) {
      const ensured = await ensureUserProfile(admin, userData.user, {
        activateIfEmailConfirmed: true,
        source: 'auth/callback',
      });
      if (!ensured.ok) {
        console.warn('[auth/callback] ensureUserProfile failed', ensured.error);
      }
    } else {
      console.warn('[auth/callback] service_role missing — profile not ensured server-side');
    }

    return redirectWithCookies(request, `${origin}${next}`, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth/callback] unexpected_error', { message });
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback_failed&reason=${encodeURIComponent(message)}`,
    );
  }
}

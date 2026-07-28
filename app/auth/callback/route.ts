import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';

const DEFAULT_NEXT = '/dashboard';

function safeNextPath(raw: string | null): string {
  const next = String(raw ?? '').trim() || DEFAULT_NEXT;
  if (!next.startsWith('/') || next.startsWith('//')) return DEFAULT_NEXT;
  return next;
}

/**
 * Auth callback for:
 * - Email confirm (token_hash + type=signup) — Confirm Signup template
 * - PKCE OAuth / magic-link code exchange (?code=…)
 *
 * Sets session cookies via @supabase/ssr, then redirects into the app.
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

  // Build redirect response first so Set-Cookie from exchange/verify attaches to it.
  let response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.redirect(`${origin}${next}`);
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
        console.error('[auth/callback] verifyOtp failed', {
          type,
          message: error.message,
        });
        return NextResponse.redirect(
          `${origin}/login?error=auth_callback_failed&reason=${encodeURIComponent(error.message)}`,
        );
      }
      return response;
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('[auth/callback] exchangeCodeForSession failed', { message: error.message });
        return NextResponse.redirect(
          `${origin}/login?error=auth_callback_failed&reason=${encodeURIComponent(error.message)}`,
        );
      }
      return response;
    }

    console.warn('[auth/callback] missing code/token_hash', {
      keys: Array.from(searchParams.keys()),
    });
    return NextResponse.redirect(`${origin}/login?error=auth_callback_missing_params`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth/callback] unexpected_error', { message });
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback_failed&reason=${encodeURIComponent(message)}`,
    );
  }
}

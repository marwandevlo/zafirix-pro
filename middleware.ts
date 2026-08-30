import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { jwtUserShowsAdmin, roleGrantsAdminAccess } from '@/app/lib/admin/can-access-admin';
import { ensureUserProfile } from '@/app/lib/ensure-user-profile';
import {
  createServiceRoleClient,
  readAuthoritativeProfileStatus,
  warnIfMissingServiceRoleKey,
} from '@/app/lib/atlas-profile-status-server';
import { isClientPortalBridgeEnabled } from '@/app/lib/atlas-sprint0-flags';
import {
  isActiveStatus,
  isBlockedStatus,
  isPendingStatus,
  normalizeStatus,
  type ProfileStatus,
} from '@/app/types/auth';
import { finalizeHtmlDocumentResponse } from '@/app/lib/html-cache-headers';
import { applyReferralCookieFromRequest } from '@/app/lib/atlas-referral-cookie';
import { requestHasSupabaseSessionCookie } from '@/app/lib/atlas-auth-cookie';
import { normalizeReferralCode } from '@/app/lib/atlas-referral-utils';

async function userHasAdminAccess(user: User, supabaseUrl: string): Promise<boolean> {
  if (jwtUserShowsAdmin(user)) return true;

  warnIfMissingServiceRoleKey('middleware.adminAccess');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) return false;

  try {
    const adminClient = createServerClient(supabaseUrl, serviceRoleKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });
    const { data: prof, error } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[middleware] admin role read failed:', error.message);
      return false;
    }

    return roleGrantsAdminAccess(String((prof as { role?: string | null } | null)?.role ?? ''));
  } catch (err) {
    console.warn('[middleware] admin role exception:', err instanceof Error ? err.message : err);
    return false;
  }
}

const PUBLIC_PATHS = new Set([
  '/landing',
  '/blog',
  '/pricing',
  '/login',
  '/signup',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/terms',
  '/privacy',
  '/access-denied',
  '/auth/callback',
]);

/** Public files under /public must never hit the auth gate (covers, icons, fonts). */
function isPublicStaticAsset(pathname: string): boolean {
  if (pathname.startsWith('/images/')) return true;
  if (pathname.startsWith('/fonts/')) return true;
  return /\.(?:avif|css|gif|ico|jpe?g|js|map|mp4|png|svg|ttf|txt|webm|webmanifest|webp|woff2?|xml)$/i.test(
    pathname,
  );
}

function isAnonymousTelemetryPath(pathname: string): boolean {
  return (
    pathname === '/api/analytics/track' ||
    pathname === '/api/analytics/pageview' ||
    pathname === '/api/funnel/track' ||
    pathname === '/api/referral/click'
  );
}

function withReferralCookie(request: NextRequest, response: NextResponse): NextResponse {
  applyReferralCookieFromRequest(request, response);
  return response;
}

function isPublicPath(pathname: string): boolean {
  if (isPublicStaticAsset(pathname)) return true;
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname === '/fr' || pathname === '/ar' || pathname === '/home') return true;
  if (pathname.startsWith('/landing')) return true;
  if (pathname === '/blog' || pathname.startsWith('/blog/')) return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname === '/legal' || pathname.startsWith('/legal/')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/zafirix-')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname === '/manifest.json') return true;
  if (pathname === '/sw.js') return true;
  if (pathname.startsWith('/robots.txt')) return true;
  if (pathname.startsWith('/sitemap')) return true;
  if (pathname === '/share' || pathname.startsWith('/share/')) return true;
  if (pathname.startsWith('/api/share/')) return true;
  if (pathname.startsWith('/feedback/')) return true;
  if (pathname.startsWith('/api/client-feedback/public/')) return true;
  if (pathname.startsWith('/auditor/')) return true;
  if (pathname.startsWith('/api/auditor/') && !pathname.startsWith('/api/auditor/pass')) return true;
  if (isClientPortalPublicPath(pathname)) return true;
  return false;
}

/** Client portal — public when bridge is enabled (no accountant login required). */
function isClientPortalPublicPath(pathname: string): boolean {
  const isPortal =
    pathname === '/client' ||
    pathname === '/portal' ||
    pathname.startsWith('/portal/') ||
    pathname.startsWith('/api/client-portal/');
  if (!isPortal) return false;
  return isClientPortalBridgeEnabled();
}

function isProfileGateExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api') ||
    pathname.startsWith('/admin') ||
    pathname === '/pending-approval' ||
    pathname === '/access-denied'
  );
}

function applyProfileGate(
  pathname: string,
  normalized: ProfileStatus,
  request: NextRequest,
  sessionResponse: NextResponse,
  user?: User | null,
): NextResponse | null {
  // Platform owner / admin never blocked by pending or suspended profile state.
  if (user && jwtUserShowsAdmin(user)) {
    return null;
  }

  if (!isProfileGateExemptPath(pathname)) {
    if (isPendingStatus(normalized)) {
      const url = request.nextUrl.clone();
      url.pathname = '/pending-approval';
      return copySessionCookies(sessionResponse, NextResponse.redirect(url));
    }
    if (isBlockedStatus(normalized)) {
      const url = request.nextUrl.clone();
      url.pathname = '/access-denied';
      return copySessionCookies(sessionResponse, NextResponse.redirect(url));
    }
  }

  if (pathname === '/pending-approval' && isActiveStatus(normalized)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return copySessionCookies(sessionResponse, NextResponse.redirect(url));
  }

  return null;
}

function copySessionCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie.name, cookie.value);
  }
  return to;
}

async function resolveProfileStatusForGate(
  user: User,
  supabaseUrl: string,
  sessionClient: ReturnType<typeof createServerClient>,
): Promise<ProfileStatus | null> {
  let statusRead = await readAuthoritativeProfileStatus(user.id, {
    supabaseUrl,
    sessionClient,
    context: 'middleware.profileGate',
  });

  const needsEnsure =
    statusRead.normalized === null ||
    (statusRead.normalized === 'pending' && Boolean(user.email_confirmed_at));

  if (needsEnsure) {
    const admin = createServiceRoleClient(supabaseUrl);
    if (admin) {
      await ensureUserProfile(admin, user, {
        activateIfEmailConfirmed: true,
        source: 'middleware.profileGate',
      });
      statusRead = await readAuthoritativeProfileStatus(user.id, {
        supabaseUrl,
        sessionClient,
        context: 'middleware.profileGate.retry',
      });
    }
  }

  if (statusRead.normalized !== null) return statusRead.normalized;
  if (statusRead.raw !== null) return normalizeStatus(statusRead.raw);

  // Authenticated + email confirmed but no profile row yet — allow app access.
  if (user.email_confirmed_at) return 'active';

  return null;
}

/** Same-host rewrite only. Never change protocol or hostname (avoids www↔apex / http↔https loops). */
function maybeLocaleAliasRewrite(request: NextRequest): NextResponse | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const path = request.nextUrl.pathname;
  const dest = path === '/fr' || path === '/home' ? '/landing/fr' : path === '/ar' ? '/landing/ar' : null;
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest;
  return withReferralCookie(request, NextResponse.rewrite(url));
}

export async function middleware(request: NextRequest) {
  const localeAlias = maybeLocaleAliasRewrite(request);
  if (localeAlias) return localeAlias;

  const { pathname } = request.nextUrl;

  if (isAnonymousTelemetryPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname === '/api/health' || pathname === '/api/health/dependencies') {
    return NextResponse.next();
  }

  if (pathname === '/api/cron/email-lifecycle' || pathname === '/api/webhooks/paddle') {
    return NextResponse.next();
  }

  if (pathname === '/register') {
    const url = request.nextUrl.clone();
    url.pathname = '/signup';
    return withReferralCookie(request, NextResponse.redirect(url));
  }

  if (isPublicPath(pathname)) {
    const publicResponse = finalizeHtmlDocumentResponse(NextResponse.next(), pathname);
    return withReferralCookie(request, publicResponse);
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ATLAS_E2E_LOCAL !== 'true' &&
    process.env.NEXT_PUBLIC_ATLAS_E2E_LOCAL !== 'true' &&
    atlasDataBackend() !== 'supabase'
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/landing/fr';
    url.searchParams.delete('next');
    return withReferralCookie(request, NextResponse.redirect(url));
  }

  if (pathname.startsWith('/admin') && atlasDataBackend() !== 'supabase') {
    const localAdminEnabled =
      process.env.NODE_ENV === 'development' &&
      process.env.NEXT_PUBLIC_ATLAS_ENABLE_LOCAL_ADMIN === 'true';

    if (!localAdminEnabled) {
      const url = request.nextUrl.clone();
      url.pathname = '/access-denied';
      return NextResponse.redirect(url);
    }
  }

  if (atlasDataBackend() !== 'supabase') return NextResponse.next();

  const hasSessionCookie = requestHasSupabaseSessionCookie(request.cookies);
  const hasRef = Boolean(normalizeReferralCode(request.nextUrl.searchParams.get('ref')));

  // First-time / referral visitors: no Supabase round-trip. Cookie + one hop to FR landing.
  if (!hasSessionCookie && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/landing/fr';
    url.searchParams.delete('next');
    return withReferralCookie(request, finalizeHtmlDocumentResponse(NextResponse.redirect(url), '/landing/fr'));
  }

  if (!hasSessionCookie) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'auth_required',
          message: 'Authentification requise.',
          code: 'auth_required',
          step: 'auth',
        },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    const toLogin =
      pathname.startsWith('/admin') || pathname === '/dashboard' || pathname.startsWith('/dashboard/');
    url.pathname = toLogin ? '/login' : '/landing/fr';
    if (toLogin) url.searchParams.set('next', pathname);
    else url.searchParams.delete('next');
    if (!hasRef) url.searchParams.delete('ref');
    return withReferralCookie(request, NextResponse.redirect(url, 307));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let sessionResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        sessionResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          sessionResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() refreshes cookies via setAll — do not also await getSession() (extra RTT).
  const { data } = await supabase.auth.getUser();
  let user = data.user;

  if (!user && pathname.startsWith('/api/documents/')) {
    const auth = request.headers.get('authorization') ?? '';
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (bearer) {
      const bearerClient = createServerClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        cookies: { getAll: () => [], setAll: () => {} },
      });
      const { data: bearerData } = await bearerClient.auth.getUser();
      user = bearerData.user ?? null;
    }
  }

  if (pathname.startsWith('/api/admin') && request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'auth_required',
          message: 'Authentification requise.',
          code: 'auth_required',
          step: 'auth',
        },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    const toLogin =
      pathname.startsWith('/admin') || pathname === '/dashboard' || pathname.startsWith('/dashboard/');
    url.pathname = toLogin ? '/login' : '/landing/fr';
    if (toLogin) url.searchParams.set('next', pathname);
    else url.searchParams.delete('next');
    return withReferralCookie(request, NextResponse.redirect(url, 307));
  }

  if (pathname.startsWith('/api/admin')) {
    if (!(await userHasAdminAccess(user, supabaseUrl))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  // APIs do not apply the profile gate — skip the extra profiles read.
  if (!pathname.startsWith('/api/')) {
    warnIfMissingServiceRoleKey('middleware.profileGate');
    const normalizedStatus = await resolveProfileStatusForGate(user, supabaseUrl, supabase);
    if (normalizedStatus !== null) {
      const gateRedirect = applyProfileGate(pathname, normalizedStatus, request, sessionResponse, user);
      if (gateRedirect) return withReferralCookie(request, gateRedirect);
    }
  }

  if (pathname.startsWith('/admin')) {
    if (!(await userHasAdminAccess(user, supabaseUrl))) {
      const url = request.nextUrl.clone();
      url.pathname = '/access-denied';
      return withReferralCookie(request, copySessionCookies(sessionResponse, NextResponse.redirect(url)));
    }
  }

  return withReferralCookie(request, finalizeHtmlDocumentResponse(sessionResponse, pathname));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:avif|gif|ico|jpe?g|png|svg|ttf|txt|webm|webp|woff2?)$).*)',
  ],
};

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { jwtUserShowsAdmin, roleGrantsAdminAccess } from '@/app/lib/admin/can-access-admin';
import {
  readAuthoritativeProfileStatus,
  warnIfMissingServiceRoleKey,
} from '@/app/lib/atlas-profile-status-server';
import {
  isActiveStatus,
  isBlockedStatus,
  isPendingStatus,
  normalizeStatus,
  type ProfileStatus,
} from '@/app/types/auth';

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
  '/pricing',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/terms',
  '/privacy',
  '/access-denied',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname === '/legal' || pathname.startsWith('/legal/')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/zafirix-')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname === '/manifest.json') return true;
  if (pathname.startsWith('/robots.txt')) return true;
  if (pathname.startsWith('/sitemap')) return true;
  return false;
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
): NextResponse | null {
  if (!isProfileGateExemptPath(pathname)) {
    if (isPendingStatus(normalized)) {
      const url = request.nextUrl.clone();
      url.pathname = '/pending-approval';
      return NextResponse.redirect(url);
    }
    if (isBlockedStatus(normalized)) {
      const url = request.nextUrl.clone();
      url.pathname = '/access-denied';
      return NextResponse.redirect(url);
    }
  }

  if (pathname === '/pending-approval' && isActiveStatus(normalized)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  if (pathname === '/api/health' || pathname === '/api/health/dependencies') {
    return NextResponse.next();
  }

  if (pathname === '/api/analytics/track' || pathname === '/api/funnel/track') {
    return NextResponse.next();
  }

  if (pathname === '/api/cron/email-lifecycle') {
    return NextResponse.next();
  }

  if (pathname === '/api/webhooks/paddle') {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV === 'production' && atlasDataBackend() !== 'supabase') {
    const url = request.nextUrl.clone();
    url.pathname = '/landing';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const response = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let { data } = await supabase.auth.getUser();
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
        { error: 'auth_required', code: 'auth_required', step: 'auth' },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith('/admin') ? '/login' : '/landing';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/api/admin')) {
    if (!(await userHasAdminAccess(user, supabaseUrl))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  warnIfMissingServiceRoleKey('middleware.profileGate');

  const statusRead = await readAuthoritativeProfileStatus(user.id, {
    supabaseUrl,
    sessionClient: supabase,
    context: `middleware:${pathname}`,
  });

  if (statusRead.normalized !== null) {
    const gateRedirect = applyProfileGate(pathname, statusRead.normalized, request);
    if (gateRedirect) return gateRedirect;
  } else if (statusRead.raw !== null) {
    const normalized = normalizeStatus(statusRead.raw);
    const gateRedirect = applyProfileGate(pathname, normalized, request);
    if (gateRedirect) return gateRedirect;
  }

  if (pathname.startsWith('/admin')) {
    if (!(await userHasAdminAccess(user, supabaseUrl))) {
      const url = request.nextUrl.clone();
      url.pathname = '/access-denied';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|zafirix-favicon\\.png|zafirix-icon-192\\.png|zafirix-icon-512\\.png).*)',
  ],
};

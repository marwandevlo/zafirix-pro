import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const portalHost = process.env.NEXT_PUBLIC_PORTAL_HOST?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

/** Build id from Vercel env only — never spawn git/child processes (hangs Linux CI + traces the whole repo). */
function resolveBuildId(): string {
  return (
    process.env.NEXT_PUBLIC_APP_BUILD_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.APP_BUILD_ID?.trim() ||
    `local-${Date.now()}`
  );
}

const PRODUCTION_SUPABASE_REF = 'kwylivmhlcuflubyubdv';

function jwtProjectRef(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload?.ref === 'string' ? payload.ref : '';
  } catch {
    return '';
  }
}

/**
 * Vercel Preview deployments must never reach the production database.
 * A Preview build fails unless ATLAS_PREVIEW_ISOLATED_DB=1 is set for the Preview scope and
 * no Supabase/Postgres variable (URL or key) belongs to the production project. Values are never printed.
 */
function assertPreviewUsesIsolatedDatabase(): void {
  if (process.env.VERCEL_ENV !== 'preview') return;
  const offending = Object.entries(process.env)
    .filter(([name]) => /SUPABASE|DATABASE|POSTGRES/i.test(name))
    .filter(([, value]) => {
      const v = String(value ?? '');
      return v.includes(PRODUCTION_SUPABASE_REF) || jwtProjectRef(v) === PRODUCTION_SUPABASE_REF;
    })
    .map(([name]) => name);
  if (offending.length || process.env.ATLAS_PREVIEW_ISOLATED_DB !== '1') {
    throw new Error(
      `[atlas:preview-guard] Preview build refused: it must use an isolated Supabase project. ` +
        (offending.length
          ? `These variables point to production: ${offending.join(', ')}. `
          : 'ATLAS_PREVIEW_ISOLATED_DB=1 is not set for Preview. ') +
        'Set Preview-scoped Supabase variables to a non-production project, then set ATLAS_PREVIEW_ISOLATED_DB=1.',
    );
  }
}

assertPreviewUsesIsolatedDatabase();

const appBuildId = resolveBuildId();
const PRODUCTION_SITE_URL = 'https://zafirixpro.com';

function resolveBundledSiteUrl(): string | undefined {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!isProd) return process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (!raw || /vercel\.app/i.test(raw)) return PRODUCTION_SITE_URL;
  if (/zafirixpro\.com/i.test(raw)) return PRODUCTION_SITE_URL;
  return raw.replace(/\/$/, '');
}

const bundledSiteUrl = resolveBundledSiteUrl();

const htmlNoStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
  { key: 'CDN-Cache-Control', value: 'no-store' },
  { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
  { key: 'Pragma', value: 'no-cache' },
];

const nativeServerPackages = [
  'pdf-to-img',
  'pdfjs-dist',
  'sharp',
  '@img/sharp-linux-x64',
  '@img/sharp-libvips-linux-x64',
  '@napi-rs/canvas',
  '@napi-rs/canvas-linux-x64-gnu',
  'resend',
  '@thednp/dommatrix',
];

const nativeTraceGlobs = [
  './node_modules/pdf-to-img/**',
  './node_modules/pdfjs-dist/**',
  './node_modules/@napi-rs/canvas/**',
  './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
  './node_modules/sharp/**',
  './node_modules/@img/sharp-linux-x64/**',
  './node_modules/@img/sharp-libvips-linux-x64/**',
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_BUILD_ID: appBuildId,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "G-3D9X4FJQ68",
    ...(bundledSiteUrl
      ? {
          NEXT_PUBLIC_SITE_URL: bundledSiteUrl,
          NEXT_PUBLIC_APP_URL: bundledSiteUrl,
        }
      : {}),
  },
  generateBuildId: async () => appBuildId,
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    proxyClientMaxBodySize: '55mb',
  },
  // Native addons must stay external — bundling them crashes the Vercel Linux compile.
  // Do not add `canvas` (node-canvas / cairo) to dependencies or transpilePackages.
  serverExternalPackages: nativeServerPackages,
  outputFileTracingIncludes: {
    '/api/documents/**': nativeTraceGlobs,
    '/api/documents/upload/**': nativeTraceGlobs,
  },
  outputFileTracingExcludes: {
    '/api/admin/diagnose': ['.git/**', '.next/**', 'public/images/blog/**'],
  },
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/_next/image/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
      {
        source: '/',
        headers: htmlNoStoreHeaders,
      },
      {
        source: '/:path((?!_next/static|_next/image|.*\\..*).*)',
        headers: htmlNoStoreHeaders,
        missing: [
          { type: 'header', key: 'next-router-prefetch' },
          { type: 'header', key: 'purpose', value: 'prefetch' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/client', destination: '/portal', permanent: false },
      { source: '/register', destination: '/signup', permanent: false },
      { source: '/fr', destination: '/landing/fr', permanent: false },
      { source: '/ar', destination: '/landing/ar', permanent: false },
      { source: '/home', destination: '/landing/fr', permanent: false },
    ];
  },
  async rewrites() {
    if (!portalHost) return [];
    return {
      beforeFiles: [
        {
          // Never swallow marketing locales (`/fr`, `/ar`) or app shells on the portal host.
          source:
            '/:companyCode((?!fr|ar|landing|blog|pricing|login|signup|register|admin|api|dashboard|portal|home|auth)[^/]+)',
          has: [{ type: 'host', value: portalHost }],
          destination: '/portal/:companyCode',
        },
        {
          source: '/',
          has: [{ type: 'host', value: portalHost }],
          destination: '/portal',
        },
      ],
    };
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});

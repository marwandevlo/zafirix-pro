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

const appBuildId = resolveBuildId();

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
    return [{ source: '/client', destination: '/portal', permanent: true }];
  },
  async rewrites() {
    if (!portalHost) return [];
    return {
      beforeFiles: [
        {
          source: '/:companyCode',
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

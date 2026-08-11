import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { execSync } from 'node:child_process';

const portalHost = process.env.NEXT_PUBLIC_PORTAL_HOST?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

function resolveBuildId(): string {
  if (process.env.NEXT_PUBLIC_APP_BUILD_ID?.trim()) {
    return process.env.NEXT_PUBLIC_APP_BUILD_ID.trim();
  }
  if (process.env.VERCEL_GIT_COMMIT_SHA?.trim()) {
    return process.env.VERCEL_GIT_COMMIT_SHA.trim();
  }
  if (process.env.VERCEL_DEPLOYMENT_ID?.trim()) {
    return process.env.VERCEL_DEPLOYMENT_ID.trim();
  }
  if (process.env.APP_BUILD_ID?.trim()) {
    return process.env.APP_BUILD_ID.trim();
  }
  try {
    return execSync('node scripts/resolve-app-build-id.mjs', { encoding: 'utf8' }).trim();
  } catch {
    return `local-${Date.now()}`;
  }
}

const appBuildId = resolveBuildId();

/** HTML/RSC shells: never cache. Hashed bundles under /_next/static: immutable long cache. */
const htmlNoStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
  { key: 'CDN-Cache-Control', value: 'no-store' },
  { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
  { key: 'Pragma', value: 'no-cache' },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_BUILD_ID: appBuildId,
  },
  generateBuildId: async () => appBuildId,
  experimental: {
    proxyClientMaxBodySize: '55mb',
  },
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist', 'sharp', '@napi-rs/canvas'],
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
      { source: '/client', destination: '/portal', permanent: true },
    ];
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

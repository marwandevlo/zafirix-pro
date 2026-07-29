import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const portalHost = process.env.NEXT_PUBLIC_PORTAL_HOST?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '55mb',
  },
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist', 'sharp', '@napi-rs/canvas'],
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

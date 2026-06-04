import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '55mb',
  },
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist', 'sharp', '@napi-rs/canvas'],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});

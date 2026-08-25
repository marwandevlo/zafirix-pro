import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/app/lib/atlas-app-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/', '/landing', '/pricing'],
        disallow: ['/admin', '/api/', '/dashboard'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: new URL(absoluteUrl('/')).host,
  };
}

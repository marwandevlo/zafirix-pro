import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/', '/landing', '/pricing'],
        disallow: ['/admin', '/api/', '/dashboard'],
      },
    ],
    sitemap: 'https://www.zafirixpro.com/sitemap.xml',
    host: 'www.zafirixpro.com',
  };
}

import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/app/lib/atlas-app-url';
import { getAllBlogPosts } from '@/app/lib/blog/posts';
import { blogPostPath } from '@/app/lib/blog/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

const PUBLIC_PAGES: Array<{
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
  priority: number;
}> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/landing/fr', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/landing/ar', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/login', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/signup', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/forgot-password', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/affiliates/program', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/legal', changeFrequency: 'yearly', priority: 0.4 },
  { path: '/legal/terms', changeFrequency: 'yearly', priority: 0.4 },
  { path: '/legal/privacy', changeFrequency: 'yearly', priority: 0.4 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
];

function safeDate(value?: string): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function blogEntries(): MetadataRoute.Sitemap {
  try {
    return getAllBlogPosts().map((post) => ({
      url: absoluteUrl(blogPostPath(post.slug)),
      lastModified: safeDate(post.updatedAt ?? post.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error('[sitemap] blog posts unavailable:', error);
    return [];
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    ...PUBLIC_PAGES.map((page) => ({
      url: absoluteUrl(page.path),
      lastModified: now,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...blogEntries(),
  ];
}

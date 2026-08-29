import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/app/lib/atlas-app-url';
import { getAllBlogPosts } from '@/app/lib/blog/posts';
import { blogPostPath } from '@/app/lib/blog/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllBlogPosts().map((post) => ({
    url: absoluteUrl(blogPostPath(post.slug)),
    lastModified: new Date(post.updatedAt ?? post.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [
    { url: absoluteUrl('/'), lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/blog'), lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/blog?lang=ar'), lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/landing/fr'), lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/landing/ar'), lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/pricing'), lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    ...posts,
  ];
}

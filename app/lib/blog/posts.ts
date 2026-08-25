import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from '@/app/lib/blog/parse-frontmatter';
import type { BlogFrontmatter, BlogLocale, BlogPost } from '@/app/lib/blog/types';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

function readingMinutes(body: string, locale: BlogLocale): number {
  const tokens = body.replace(/[#*_`>-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const wpm = locale === 'ar' ? 180 : 220;
  return Math.max(1, Math.round(tokens.length / wpm));
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function toPost(filename: string, raw: string): BlogPost {
  const { fields, body } = parseFrontmatter(raw);
  const locale = fields.locale === 'ar' ? 'ar' : 'fr';
  const slug = fields.slug?.trim();
  const title = fields.title?.trim();
  const description = fields.description?.trim();
  const publishedAt = fields.publishedAt?.trim();
  const alternateSlug = fields.alternateSlug?.trim();

  if (!slug || !title || !description || !publishedAt || !alternateSlug) {
    throw new Error(`Invalid blog frontmatter in ${filename}`);
  }

  const frontmatter: BlogFrontmatter = {
    slug,
    locale,
    alternateSlug,
    title,
    description,
    publishedAt,
    updatedAt: fields.updatedAt?.trim() || undefined,
    category: fields.category?.trim() || (locale === 'ar' ? 'رؤى' : 'Insights'),
    tags: parseTags(fields.tags),
    author: fields.author?.trim() || 'Rédaction Zafirixpro',
  };

  return {
    ...frontmatter,
    body,
    readingMinutes: readingMinutes(body, locale),
  };
}

let cache: BlogPost[] | null = null;

export function getAllBlogPosts(): BlogPost[] {
  if (cache) return cache;
  if (!fs.existsSync(BLOG_DIR)) {
    cache = [];
    return cache;
  }

  const files = fs.readdirSync(BLOG_DIR).filter((name) => name.endsWith('.md'));
  const posts = files.map((filename) => {
    const raw = fs.readFileSync(path.join(BLOG_DIR, filename), 'utf8');
    return toPost(filename, raw);
  });

  posts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  cache = posts;
  return posts;
}

export function getBlogPostsByLocale(locale: BlogLocale): BlogPost[] {
  return getAllBlogPosts().filter((post) => post.locale === locale);
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return getAllBlogPosts().find((post) => post.slug === slug);
}

export function getBlogAlternate(post: BlogPost): BlogPost | undefined {
  return getBlogPostBySlug(post.alternateSlug);
}

export function getBlogSlugs(): string[] {
  return getAllBlogPosts().map((post) => post.slug);
}

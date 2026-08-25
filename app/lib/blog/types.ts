export type BlogLocale = 'fr' | 'ar';

export type BlogFrontmatter = {
  slug: string;
  locale: BlogLocale;
  alternateSlug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  category: string;
  tags: string[];
  author: string;
  image?: string;
  imageAlt?: string;
};

export type BlogPost = BlogFrontmatter & {
  body: string;
  readingMinutes: number;
};

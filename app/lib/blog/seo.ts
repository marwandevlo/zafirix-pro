import type { Metadata } from 'next';
import { absoluteUrl, getPublicAppUrl } from '@/app/lib/atlas-app-url';
import { BLOG_UI, blogListingHref } from '@/app/lib/blog/copy';
import type { BlogLocale, BlogPost } from '@/app/lib/blog/types';

const SITE_NAME = 'Zafirixpro';
const OG_IMAGE = '/zafirix-icon-512.png';

export function blogPostPath(slug: string): string {
  return `/blog/${slug}`;
}

export function blogPostUrl(slug: string): string {
  return absoluteUrl(blogPostPath(slug));
}

export function listingMetadata(locale: BlogLocale): Metadata {
  const ui = BLOG_UI[locale];
  const canonical = absoluteUrl(blogListingHref(locale));
  const title =
    locale === 'ar'
      ? 'مدونة الضرائب والمحاسبة في المغرب | زافيريكس برو'
      : 'Blog fiscal & comptable Maroc | Zafirixpro';
  const description = ui.listingSupport;

  return {
    metadataBase: new URL(getPublicAppUrl()),
    title,
    description,
    keywords:
      locale === 'ar'
        ? ['المغرب', 'الضريبة على القيمة المضافة', 'المقاول الذاتي', 'ICE', 'المحاسبة', 'زافيريكس برو']
        : ['Maroc', 'TVA', 'auto-entrepreneur', 'ICE', 'comptabilité', 'CGI', 'Zafirixpro'],
    alternates: {
      canonical,
      languages: {
        'fr-MA': absoluteUrl('/blog'),
        'ar-MA': absoluteUrl('/blog?lang=ar'),
        'x-default': absoluteUrl('/blog'),
      },
    },
    openGraph: {
      type: 'website',
      locale: ui.ogLocale,
      alternateLocale: locale === 'ar' ? ['fr_MA'] : ['ar_MA'],
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: OG_IMAGE, width: 512, height: 512, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE],
    },
    robots: { index: true, follow: true },
  };
}

export function postMetadata(post: BlogPost, alternate?: BlogPost): Metadata {
  const ui = BLOG_UI[post.locale];
  const url = blogPostUrl(post.slug);
  const languages: Record<string, string> = {
    'x-default': alternate && post.locale === 'ar' ? blogPostUrl(alternate.slug) : url,
  };
  languages[post.locale === 'ar' ? 'ar-MA' : 'fr-MA'] = url;
  if (alternate) {
    languages[alternate.locale === 'ar' ? 'ar-MA' : 'fr-MA'] = blogPostUrl(alternate.slug);
  }

  return {
    metadataBase: new URL(getPublicAppUrl()),
    title: `${post.title} | ${SITE_NAME}`,
    description: post.description,
    keywords: post.tags,
    authors: [{ name: post.author }],
    alternates: {
      canonical: url,
      languages,
    },
    openGraph: {
      type: 'article',
      locale: ui.ogLocale,
      alternateLocale: post.locale === 'ar' ? ['fr_MA'] : ['ar_MA'],
      url,
      siteName: SITE_NAME,
      title: post.title,
      description: post.description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      authors: [post.author],
      tags: post.tags,
      images: [{ url: OG_IMAGE, width: 512, height: 512, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [OG_IMAGE],
    },
    robots: { index: true, follow: true },
  };
}

export function listingJsonLd(locale: BlogLocale, posts: BlogPost[]) {
  const ui = BLOG_UI[locale];
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: ui.listingTitle,
    description: ui.listingSupport,
    url: absoluteUrl(blogListingHref(locale)),
    inLanguage: ui.htmlLang,
    publisher: organizationJsonLd(),
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: blogPostUrl(post.slug),
      datePublished: post.publishedAt,
      inLanguage: BLOG_UI[post.locale].htmlLang,
    })),
  };
}

export function articleJsonLd(post: BlogPost) {
  const ui = BLOG_UI[post.locale];
  const url = blogPostUrl(post.slug);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    inLanguage: ui.htmlLang,
    author: {
      '@type': 'Organization',
      name: post.author,
      url: absoluteUrl('/'),
    },
    publisher: organizationJsonLd(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
    keywords: post.tags.join(', '),
    articleSection: post.category,
    timeRequired: `PT${post.readingMinutes}M`,
  };
}

function organizationJsonLd() {
  return {
    '@type': 'Organization',
    name: SITE_NAME,
    url: absoluteUrl('/'),
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/zafirix-icon-512.png'),
    },
  };
}

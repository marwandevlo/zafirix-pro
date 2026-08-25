import type { Metadata } from 'next';
import { BlogChrome } from '@/app/components/blog/BlogChrome';
import { BlogCtaBanner } from '@/app/components/blog/BlogCtaBanner';
import { BlogPostCard } from '@/app/components/blog/BlogPostCard';
import { BLOG_CYAN, BLOG_NAVY, BLOG_UI, blogListingHref } from '@/app/lib/blog/copy';
import { getBlogPostsByLocale } from '@/app/lib/blog/posts';
import { listingJsonLd, listingMetadata } from '@/app/lib/blog/seo';
import type { BlogLocale } from '@/app/lib/blog/types';

type Props = {
  searchParams: Promise<{ lang?: string }>;
};

function resolveLocale(lang?: string): BlogLocale {
  return lang === 'ar' ? 'ar' : 'fr';
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { lang } = await searchParams;
  return listingMetadata(resolveLocale(lang));
}

export default async function BlogIndexPage({ searchParams }: Props) {
  const { lang } = await searchParams;
  const locale = resolveLocale(lang);
  const ui = BLOG_UI[locale];
  const posts = getBlogPostsByLocale(locale);
  const jsonLd = listingJsonLd(locale, posts);

  return (
    <BlogChrome locale={locale} altHref={blogListingHref(locale === 'ar' ? 'fr' : 'ar')}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section
        className="relative overflow-hidden text-white"
        style={{ background: `linear-gradient(145deg, ${BLOG_NAVY} 0%, #163057 50%, #0e7490 120%)` }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage: `radial-gradient(circle at 18% 25%, ${BLOG_CYAN}47, transparent 42%)`,
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-14 sm:pt-16 sm:pb-20">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: BLOG_CYAN }}>
            {ui.badge}
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-balance max-w-4xl leading-[1.15]">
            {ui.listingTitle}
          </h1>
          <p className="mt-4 text-sm sm:text-lg text-white/75 max-w-2xl leading-relaxed">{ui.listingSupport}</p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 w-full">
        <h2 className="sr-only">{ui.allArticles}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {posts.map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
        <BlogCtaBanner locale={locale} />
      </section>
    </BlogChrome>
  );
}

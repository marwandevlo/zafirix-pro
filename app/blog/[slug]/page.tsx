import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { BlogChrome } from '@/app/components/blog/BlogChrome';
import { BlogCoverImage, stripLeadCoverImage } from '@/app/components/blog/BlogCoverImage';
import { BlogCtaBanner } from '@/app/components/blog/BlogCtaBanner';
import { BlogMarkdown } from '@/app/components/blog/BlogMarkdown';
import { BlogPostCard } from '@/app/components/blog/BlogPostCard';
import { isolateBlogBidi } from '@/app/lib/blog/bidi';
import { BLOG_CYAN, BLOG_NAVY, BLOG_UI, blogListingHref, formatBlogDate } from '@/app/lib/blog/copy';
import { getBlogAlternate, getBlogPostBySlug, getBlogPostsByLocale, getBlogSlugs } from '@/app/lib/blog/posts';
import { articleJsonLd, blogPostPath, postMetadata } from '@/app/lib/blog/seo';

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return { title: 'Blog | Zafirixpro' };
  return postMetadata(post, getBlogAlternate(post));
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  const ui = BLOG_UI[post.locale];
  const alternate = getBlogAlternate(post);
  const related = getBlogPostsByLocale(post.locale)
    .filter((item) => item.slug !== post.slug)
    .slice(0, 2);
  const jsonLd = articleJsonLd(post);
  const isAr = post.locale === 'ar';

  return (
    <BlogChrome locale={post.locale} altHref={alternate ? blogPostPath(alternate.slug) : blogListingHref(post.locale === 'ar' ? 'fr' : 'ar')}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article
        className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-16 w-full"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <Link
          href={blogListingHref(post.locale)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} className={isAr ? 'rotate-180' : undefined} />
          {ui.backToBlog}
        </Link>

        <p className="mt-6 text-[11px] font-bold uppercase tracking-widest" style={{ color: BLOG_CYAN }}>
          {post.category}
        </p>
        <h1
          className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-balance leading-[1.2]"
          style={{ color: BLOG_NAVY, unicodeBidi: isAr ? 'isolate' : undefined }}
        >
          {isAr ? isolateBlogBidi(post.title) : post.title}
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
          {isAr ? isolateBlogBidi(post.description) : post.description}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500">
          <span>
            {ui.writtenBy} {post.author}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.publishedAt}>
            {ui.publishedLabel} {formatBlogDate(post.publishedAt, post.locale)}
          </time>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} />
            {ui.readingLabel(post.readingMinutes)}
          </span>
        </div>

        {post.image ? (
          <BlogCoverImage src={post.image} alt={post.imageAlt ?? post.title} variant="header" />
        ) : null}

        <div className="mt-8 border-t border-slate-200 pt-2">
          <BlogMarkdown markdown={stripLeadCoverImage(post.body, post.image)} rtl={isAr} />
        </div>

        <BlogCtaBanner locale={post.locale} />

        {related.length > 0 ? (
          <section className="mt-12">
            <h2 className="text-xl font-extrabold mb-4" style={{ color: BLOG_NAVY }}>
              {ui.relatedTitle}
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {related.map((item) => (
                <BlogPostCard key={item.slug} post={item} />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </BlogChrome>
  );
}

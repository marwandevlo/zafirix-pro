import Link from 'next/link';
import { Clock } from 'lucide-react';
import { BlogCoverImage } from '@/app/components/blog/BlogCoverImage';
import { isolateBlogBidi } from '@/app/lib/blog/bidi';
import { BLOG_CYAN, BLOG_NAVY, BLOG_UI, formatBlogDate } from '@/app/lib/blog/copy';
import { blogPostPath } from '@/app/lib/blog/seo';
import type { BlogPost } from '@/app/lib/blog/types';

export function BlogPostCard({ post }: { post: BlogPost }) {
  const ui = BLOG_UI[post.locale];

  return (
    <article className="rounded-2xl border border-[#0F1F3D]/8 bg-white overflow-hidden shadow-sm flex flex-col h-full">
      {post.image ? (
        <BlogCoverImage src={post.image} alt={post.imageAlt ?? post.title} variant="card" />
      ) : null}
      <div className="p-5 sm:p-6 flex flex-col flex-1">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: BLOG_CYAN }}>
          {post.category}
        </p>
        <h2 className="mt-2 text-lg sm:text-xl font-extrabold leading-snug text-balance" style={{ color: BLOG_NAVY }}>
          <Link href={blogPostPath(post.slug)} className="hover:underline underline-offset-4">
            {post.locale === 'ar' ? isolateBlogBidi(post.title) : post.title}
          </Link>
        </h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed flex-1">
          {post.locale === 'ar' ? isolateBlogBidi(post.description) : post.description}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt, post.locale)}</time>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {ui.readingLabel(post.readingMinutes)}
          </span>
        </div>
      </div>
    </article>
  );
}

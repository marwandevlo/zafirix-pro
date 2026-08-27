'use client';

import Link from 'next/link';
import { isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { BlogCoverImage } from '@/app/components/blog/BlogCoverImage';
import { isolateBlogBidi } from '@/app/lib/blog/bidi';
import { BLOG_CYAN, BLOG_NAVY } from '@/app/lib/blog/copy';

function onlyCoverChild(children: ReactNode) {
  const list = Array.isArray(children) ? children : [children];
  const significant = list.filter((child) => {
    if (child == null || child === false) return false;
    if (typeof child === 'string') return child.trim().length > 0;
    return true;
  });
  if (significant.length === 1 && isValidElement(significant[0]) && significant[0].type === BlogCoverImage) {
    return significant[0];
  }
  return null;
}

export function BlogMarkdown({ markdown, rtl = false }: { markdown: string; rtl?: boolean }) {
  const text = (children: React.ReactNode) => (rtl ? isolateBlogBidi(children) : children);

  return (
    <div className="blog-prose text-[17px] sm:text-lg leading-[1.8]" dir={rtl ? 'rtl' : undefined}>
      <ReactMarkdown
        components={{
          h2: ({ children }) => (
            <h2 className="mt-10 mb-3 text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: BLOG_NAVY }}>
              {text(children)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-8 mb-2 text-lg font-bold" style={{ color: BLOG_NAVY }}>
              {text(children)}
            </h3>
          ),
          p: ({ children }) => {
            const cover = onlyCoverChild(children);
            if (cover) return cover;
            return <p className="my-4 text-slate-700">{text(children)}</p>;
          },
          ul: ({ children }) => <ul className="my-4 space-y-2 ps-5 list-disc text-slate-700">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 space-y-2 ps-5 list-decimal text-slate-700">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{text(children)}</li>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{text(children)}</strong>,
          a: ({ href, children }) => {
            const internal = href?.startsWith('/');
            if (internal && href) {
              return (
                <Link href={href} className="font-semibold underline-offset-4 hover:underline" style={{ color: BLOG_CYAN }}>
                  {text(children)}
                </Link>
              );
            }
            return (
              <a
                href={href}
                className="font-semibold underline-offset-4 hover:underline"
                style={{ color: BLOG_CYAN }}
                rel="noopener noreferrer"
                target="_blank"
              >
                {text(children)}
              </a>
            );
          },
          code: ({ children }) => (
            <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.9em] text-slate-800" dir="ltr">
              {children}
            </code>
          ),
          img: ({ src, alt }) =>
            typeof src === 'string' && src ? <BlogCoverImage src={src} alt={alt ?? ''} variant="body" /> : null,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

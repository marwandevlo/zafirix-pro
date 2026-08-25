'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { isolateBlogBidi } from '@/app/lib/blog/bidi';
import { BLOG_CYAN, BLOG_NAVY } from '@/app/lib/blog/copy';

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
          p: ({ children }) => <p className="my-4 text-slate-700">{text(children)}</p>,
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
            src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt ?? ''}
                className="my-6 w-full rounded-2xl border border-[#0F1F3D]/10 object-cover"
              />
            ) : null,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

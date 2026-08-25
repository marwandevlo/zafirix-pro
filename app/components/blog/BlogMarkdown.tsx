'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { BLOG_CYAN, BLOG_NAVY } from '@/app/lib/blog/copy';

export function BlogMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="blog-prose text-[17px] sm:text-lg leading-[1.8]">
      <ReactMarkdown
        components={{
          h2: ({ children }) => (
            <h2 className="mt-10 mb-3 text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: BLOG_NAVY }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-8 mb-2 text-lg font-bold" style={{ color: BLOG_NAVY }}>
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="my-4 text-slate-700">{children}</p>,
          ul: ({ children }) => <ul className="my-4 space-y-2 ps-5 list-disc text-slate-700">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 space-y-2 ps-5 list-decimal text-slate-700">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          a: ({ href, children }) => {
            const internal = href?.startsWith('/');
            if (internal && href) {
              return (
                <Link href={href} className="font-semibold underline-offset-4 hover:underline" style={{ color: BLOG_CYAN }}>
                  {children}
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
                {children}
              </a>
            );
          },
          code: ({ children }) => (
            <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.9em] text-slate-800">{children}</code>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

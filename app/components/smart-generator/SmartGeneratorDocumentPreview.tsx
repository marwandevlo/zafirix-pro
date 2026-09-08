'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function hasArabicScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

type Props = {
  content: string;
  loading?: boolean;
};

export function SmartGeneratorDocumentPreview({ content, loading }: Props) {
  const rtl = hasArabicScript(content);

  return (
    <div
      className="smart-gen-doc-preview bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-800 leading-relaxed min-h-[200px] shadow-sm"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-indigo-900 border-b border-indigo-100 pb-2 mb-4">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold text-gray-900 mt-5 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-1.5">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2 text-gray-700">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
          ul: ({ children }) => <ul className="my-2 space-y-1 ps-5 list-disc text-gray-700">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 space-y-1 ps-5 list-decimal text-gray-700">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          hr: () => <hr className="my-4 border-gray-200" />,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-s-4 border-indigo-300 bg-indigo-50/50 ps-4 py-2 text-gray-700 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] font-mono text-gray-800" dir="ltr">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs font-mono" dir="ltr">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[320px] text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-indigo-900 text-white">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-gray-100">{children}</tbody>,
          tr: ({ children }) => <tr className="even:bg-gray-50/80">{children}</tr>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-start font-semibold whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-gray-700 align-top">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {loading ? (
        <span className="inline-block w-2 h-4 bg-indigo-400 animate-pulse ms-0.5 align-middle" />
      ) : null}
    </div>
  );
}

/** Plain-text fallback for copy/export when markdown stripping is needed. */
export function stripMarkdownForExport(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim();
}

export function ChatMessageBody({ content }: { content: string }) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function isRtlContent(text: string): boolean {
  return hasArabicScript(text);
}

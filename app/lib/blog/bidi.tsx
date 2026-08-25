import { Fragment, type ReactNode } from 'react';

/**
 * Numeric / year runs that reverse under RTL (2026-2027 → 2027-2026).
 * Matched as one LTR isolate so hyphens, slashes, and grouped thousands stay in writing order.
 */
const LTR_NUMERIC_RUN =
  /(?:n°\s*)?(?:\d{1,3}(?:[\u00A0 ]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*[%٪])?(?:\s*[-–—/.]\s*(?:\d{1,3}(?:[\u00A0 ]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*[%٪])?)+|\d{1,3}(?:[\u00A0 ]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+\s*[%٪]?|\d+\s*[%٪]|\d{2,}/g;

export const BLOG_LTR_NUM_CLASS = 'blog-ltr-num';

export function wrapLtrNumericRuns(text: string, keyPrefix = 'n'): ReactNode {
  const re = new RegExp(LTR_NUMERIC_RUN.source, LTR_NUMERIC_RUN.flags);
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span key={`${keyPrefix}-${i++}`} dir="ltr" className={BLOG_LTR_NUM_CLASS}>
        {match[0]}
      </span>,
    );
    last = start + match[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function isolateBlogBidi(children: ReactNode): ReactNode {
  if (children == null || typeof children === 'boolean') return children;
  if (typeof children === 'number') return wrapLtrNumericRuns(String(children));
  if (typeof children === 'string') return wrapLtrNumericRuns(children);
  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <Fragment key={`bidi-${index}`}>{isolateBlogBidi(child)}</Fragment>
    ));
  }
  return children;
}

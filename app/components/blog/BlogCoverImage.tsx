export function BlogCoverImage({
  src,
  alt,
  variant = 'card',
}: {
  src: string;
  alt: string;
  variant?: 'card' | 'header' | 'body';
}) {
  const frame =
    variant === 'header'
      ? 'blog-cover-frame mt-6 overflow-hidden rounded-2xl border border-[#0F1F3D]/10'
      : variant === 'body'
        ? 'blog-cover-frame my-6 overflow-hidden rounded-2xl border border-[#0F1F3D]/10'
        : 'blog-cover-frame overflow-hidden';

  return (
    <div
      className={frame}
      style={{ width: '100%', maxWidth: '100%', flexShrink: 0 }}
    >
      <div
        className="blog-cover-ratio relative w-full overflow-hidden bg-[#0F1F3D]"
        style={{
          position: 'relative',
          width: '100%',
          height: 0,
          paddingBottom: '56.25%',
          overflow: 'hidden',
          background: '#0F1F3D',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={1536}
          height={864}
          className="absolute inset-0 block h-auto w-full max-w-full object-cover object-center"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
          decoding="async"
          loading={variant === 'header' ? 'eager' : 'lazy'}
        />
      </div>
    </div>
  );
}

/** Drop the lead markdown image when the article header already shows the same cover. */
export function stripLeadCoverImage(markdown: string, coverSrc?: string): string {
  if (!coverSrc) return markdown;
  const escaped = coverSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markdown.replace(new RegExp(`^\\s*!\\[[^\\]]*\\]\\(${escaped}\\)\\s*\\n*`), '');
}

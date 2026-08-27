import Image from 'next/image';

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

  const sizes =
    variant === 'card' ? '(max-width: 768px) 100vw, 420px' : '(max-width: 768px) 100vw, 768px';

  return (
    <div className={frame} style={{ width: '100%', maxWidth: '100%', flexShrink: 0 }}>
      <div
        className="blog-cover-ratio relative w-full overflow-hidden bg-[#0F1F3D]"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          minHeight: 160,
          overflow: 'hidden',
          background: '#0F1F3D',
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className="object-cover object-center"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
          priority={variant === 'header'}
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

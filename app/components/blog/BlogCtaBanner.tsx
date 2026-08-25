import Link from 'next/link';
import { ArrowRight, Shield, Sparkles } from 'lucide-react';
import { BLOG_CYAN, BLOG_NAVY, BLOG_UI } from '@/app/lib/blog/copy';
import type { BlogLocale } from '@/app/lib/blog/types';

export function BlogCtaBanner({ locale }: { locale: BlogLocale }) {
  const ui = BLOG_UI[locale];
  const isAr = locale === 'ar';

  return (
    <aside
      className="mt-12 rounded-3xl overflow-hidden text-white relative"
      style={{ background: `linear-gradient(145deg, ${BLOG_NAVY} 0%, #163057 55%, #0e7490 140%)` }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(circle at 82% 18%, ${BLOG_CYAN}55, transparent 42%)`,
        }}
      />
      <div className="relative p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: BLOG_CYAN }}>
          <Sparkles size={14} />
          {ui.ctaKicker}
        </p>
        <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-balance max-w-2xl">{ui.ctaTitle}</h2>
        <p className="mt-3 text-white/75 max-w-2xl leading-relaxed">{ui.ctaSupport}</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link
            href="/signup"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-bold"
            style={{ backgroundColor: BLOG_CYAN, color: BLOG_NAVY }}
          >
            {ui.ctaTrial}
            <ArrowRight size={16} className={isAr ? 'rotate-180' : undefined} />
          </Link>
          <Link
            href="/audit"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white hover:bg-white/10"
          >
            <Shield size={16} style={{ color: BLOG_CYAN }} />
            {ui.ctaAudit}
          </Link>
        </div>
      </div>
    </aside>
  );
}

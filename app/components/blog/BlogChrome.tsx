import Link from 'next/link';
import { ZafirixLogo } from '@/app/components/branding/ZafirixLogo';
import { PublicFooter } from '@/app/components/public/PublicFooter';
import { BLOG_CYAN, BLOG_NAVY, BLOG_UI, blogListingHref } from '@/app/lib/blog/copy';
import type { BlogLocale } from '@/app/lib/blog/types';

export function BlogChrome({
  locale,
  altHref,
  children,
}: {
  locale: BlogLocale;
  altHref: string;
  children: React.ReactNode;
}) {
  const ui = BLOG_UI[locale];
  const isAr = locale === 'ar';

  return (
    <div
      className={`min-h-dvh flex flex-col bg-[#f4f6fa] overflow-x-hidden ${isAr ? 'blog-ar' : ''}`}
      dir={ui.dir}
      lang={ui.htmlLang}
    >
      <header
        className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md"
        style={{
          backgroundColor: `${BLOG_NAVY}f2`,
          paddingTop: 'max(0px, env(safe-area-inset-top))',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href={locale === 'ar' ? '/landing/ar' : '/landing/fr'} className="min-w-0">
            <ZafirixLogo size="sm" subtitle subtitleText="ZAFIRIX GROUP" subtitleClassName="text-white/45" />
          </Link>
          <nav className="flex items-center gap-2 shrink-0">
            <Link
              href={altHref}
              className="min-h-10 px-3 inline-flex items-center rounded-xl text-xs font-bold text-white/80 border border-white/15 hover:bg-white/10"
            >
              {ui.altLocaleLabel}
            </Link>
            <Link
              href={blogListingHref(locale)}
              className="hidden sm:inline-flex min-h-10 px-2 sm:px-3 items-center rounded-xl text-xs sm:text-sm font-semibold text-white"
            >
              {ui.navBlog}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-10 px-2 sm:px-3 items-center rounded-xl text-xs sm:text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              {ui.navPricing}
            </Link>
            <Link
              href="/login"
              className="hidden sm:inline-flex min-h-10 px-2 sm:px-3 items-center rounded-xl text-xs sm:text-sm font-semibold text-white/80 hover:bg-white/10"
            >
              {ui.navLogin}
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-10 items-center rounded-xl px-3 sm:px-4 text-xs sm:text-sm font-bold"
              style={{ backgroundColor: BLOG_CYAN, color: BLOG_NAVY }}
            >
              {ui.navSignup}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full">{children}</main>

      <div className="mt-auto">
        <PublicFooter />
      </div>
    </div>
  );
}

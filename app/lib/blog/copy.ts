import type { BlogLocale } from '@/app/lib/blog/types';

export const BLOG_NAVY = '#0F1F3D';
export const BLOG_CYAN = '#06b6d4';

type BlogUiCopy = {
  htmlLang: string;
  ogLocale: string;
  dir: 'ltr' | 'rtl';
  badge: string;
  listingTitle: string;
  listingSupport: string;
  readingLabel: (minutes: number) => string;
  publishedLabel: string;
  allArticles: string;
  altLocaleLabel: string;
  navBlog: string;
  navPricing: string;
  navLogin: string;
  navSignup: string;
  relatedTitle: string;
  ctaKicker: string;
  ctaTitle: string;
  ctaSupport: string;
  ctaTrial: string;
  ctaAudit: string;
  backToBlog: string;
  writtenBy: string;
};

export const BLOG_UI: Record<BlogLocale, BlogUiCopy> = {
  fr: {
    htmlLang: 'fr-MA',
    ogLocale: 'fr_MA',
    dir: 'ltr',
    badge: 'Blog Zafirixpro · Maroc',
    listingTitle: 'Fiscalité, comptabilité et réglementation au Maroc',
    listingSupport:
      'Guides clairs pour PME, auto-entrepreneurs, e-commerçants et cabinets — TVA, ICE, CGI et audit de conformité.',
    readingLabel: (minutes) => `${minutes} min de lecture`,
    publishedLabel: 'Publié le',
    allArticles: 'Tous les articles',
    altLocaleLabel: 'العربية',
    navBlog: 'Blog',
    navPricing: 'Tarifs',
    navLogin: 'Connexion',
    navSignup: 'Essai gratuit',
    relatedTitle: 'Continuer la lecture',
    ctaKicker: 'Zafirixpro',
    ctaTitle: 'Passez de la veille fiscale à l’action.',
    ctaSupport:
      'Testez la plateforme ou lancez le moteur Smart Tax Audit : ICE, TVA 20/14/10/7 % et alertes CGI en français et en arabe.',
    ctaTrial: 'Tester Zafirixpro',
    ctaAudit: 'Ouvrir Smart Tax Audit',
    backToBlog: 'Retour au blog',
    writtenBy: 'Par',
  },
  ar: {
    htmlLang: 'ar-MA',
    ogLocale: 'ar_MA',
    dir: 'rtl',
    badge: 'مدونة زافيريكس برو · المغرب',
    listingTitle: 'الضرائب والمحاسبة والتنظيم في المغرب',
    listingSupport:
      'أدلة واضحة للشركات والمقاولين الذاتيين والتجارة الإلكترونية والمكاتب — الضريبة على القيمة المضافة، ICE، المدونة العامة للضرائب والتدقيق.',
    readingLabel: (minutes) => (minutes <= 1 ? 'دقيقة للقراءة' : `${minutes} دقائق للقراءة`),
    publishedLabel: 'نُشر في',
    allArticles: 'كل المقالات',
    altLocaleLabel: 'FR',
    navBlog: 'المدونة',
    navPricing: 'الأسعار',
    navLogin: 'تسجيل الدخول',
    navSignup: 'تجربة مجانية',
    relatedTitle: 'واصل القراءة',
    ctaKicker: 'زافيريكس برو',
    ctaTitle: 'من اليقظة الجبائية إلى التنفيذ.',
    ctaSupport:
      'جرّب المنصة أو شغّل محرك التدقيق الضريبي الذكي: ICE، نسب TVA 20/14/10/7٪ وتنبيهات المدونة العامة للضرائب بالعربية والفرنسية.',
    ctaTrial: 'تجربة زافيريكس برو',
    ctaAudit: 'فتح التدقيق الضريبي الذكي',
    backToBlog: 'العودة إلى المدونة',
    writtenBy: 'بقلم',
  },
};

export function blogListingHref(locale: BlogLocale): string {
  return locale === 'ar' ? '/blog?lang=ar' : '/blog';
}

export function formatBlogDate(isoDate: string, locale: BlogLocale): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'fr-MA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

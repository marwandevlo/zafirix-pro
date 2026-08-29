'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileText,
  Scale,
  Shield,
  Sparkles,
  Truck,
  Users,
} from 'lucide-react';
import { PublicFooter } from '@/app/components/public/PublicFooter';
import { ZafirixLogo } from '@/app/components/branding/ZafirixLogo';
import { trackEvent } from '@/app/lib/analytics-track';
import { captureReferralFromWindow, logReferralLandingClick } from '@/app/lib/atlas-referral-client';
import { runWhenIdle } from '@/app/lib/atlas-telemetry-client';
import { useEffect } from 'react';

export type MarketingLocale = 'fr' | 'ar';

type Copy = {
  htmlLang: string;
  dir: 'ltr' | 'rtl';
  altLocale: MarketingLocale;
  altHref: string;
  altLabel: string;
  navPricing: string;
  navBlog: string;
  navLogin: string;
  badge: string;
  headline: string;
  support: string;
  ctaPrimary: string;
  ctaSecondary: string;
  trust: string[];
  modulesTitle: string;
  modulesSupport: string;
  modules: { title: string; desc: string; icon: typeof FileText }[];
  pricingTitle: string;
  pricingSupport: string;
  tiers: { name: string; price: string; hint: string; popular?: boolean }[];
  auditTitle: string;
  auditSupport: string;
  auditPoints: string[];
  audiencesTitle: string;
  audiences: string[];
  finalTitle: string;
  finalSupport: string;
  finalCta: string;
};

const COPY: Record<MarketingLocale, Copy> = {
  fr: {
    htmlLang: 'fr',
    dir: 'ltr',
    altLocale: 'ar',
    altHref: '/landing/ar',
    altLabel: 'العربية',
    navPricing: 'Tarifs',
    navBlog: 'Blog',
    navLogin: 'Connexion',
    badge: 'Zafirixpro · Maroc',
    headline: 'La plateforme de gestion & conformité fiscale pour le Maroc.',
    support:
      'Facturation, logistique COD, auto-entrepreneur, personne physique et audit fiscal IA — un cockpit pensé pour PME, e-commerce et cabinets.',
    ctaPrimary: 'Voir les tarifs',
    ctaSecondary: 'Essai gratuit',
    trust: ['Sans carte pour démarrer', 'Quotas & packs pay-as-you-go', 'Interface FR / AR'],
    modulesTitle: 'Modules essentiels',
    modulesSupport: 'Tout ce qu’il faut pour piloter l’entreprise au quotidien.',
    modules: [
      {
        title: 'Facturation & comptabilité',
        desc: 'Factures, clients, banque et documents IA centralisés.',
        icon: FileText,
      },
      {
        title: 'Logistique & COD',
        desc: 'Bons de livraison, transporteurs et encaissements COD.',
        icon: Truck,
      },
      {
        title: 'Auto-entrepreneur & PP',
        desc: 'Plafonds AE, ledger personne physique et IR indicatif.',
        icon: Briefcase,
      },
      {
        title: 'Expert-Comptable Virtuel',
        desc: 'Audit ICE, TVA marocaine, CNSS et cohérence des montants.',
        icon: Scale,
      },
    ],
    pricingTitle: 'Des forfaits clairs',
    pricingSupport: 'Quatre offres adaptées à votre stade — packs add-on si vous dépassez.',
    tiers: [
      { name: 'Indépendant', price: '49 MAD', hint: '/ mois · Auto-entrepreneur' },
      { name: 'Profession Libérale', price: '149 MAD', hint: '/ mois · Personne Physique' },
      { name: 'PME & E-commerce', price: '399 MAD', hint: '/ mois', popular: true },
      { name: 'Ultimate', price: 'Sur mesure', hint: 'Cabinets & usage-based' },
    ],
    auditTitle: 'Audit & Conformité Maroc',
    auditSupport:
      'Lancez l’Expert-Comptable Virtuel : taux TVA 20/14/10/7 %, ICE 15 chiffres, plafonds AE et partie double.',
    auditPoints: [
      'Alertes actionnables en français et en arabe',
      'Scan factures, achats et écritures',
      'Score de conformité en un clic',
    ],
    audiencesTitle: 'Pour qui ?',
    audiences: ['Auto-entrepreneurs', 'PME', 'Comptables & fiduciaires', 'E-commerce'],
    finalTitle: 'Choisissez le forfait adapté à votre activité.',
    finalSupport: 'Comparez Indépendant, Profession Libérale, PME et Ultimate.',
    finalCta: 'Aller aux tarifs',
  },
  ar: {
    htmlLang: 'ar',
    dir: 'rtl',
    altLocale: 'fr',
    altHref: '/landing/fr',
    altLabel: 'FR',
    navPricing: 'الأسعار',
    navBlog: 'المدونة',
    navLogin: 'تسجيل الدخول',
    badge: 'Zafirixpro · المغرب',
    headline: 'منصة الإدارة والامتثال الضريبي المصممة للمغرب.',
    support:
      'الفوترة، اللوجستيك COD، المقاول الذاتي، الشخص الذاتي، والتدقيق الضريبي بالذكاء الاصطناعي — لوحة قيادة للشركات والمتاجر والمكاتب.',
    ctaPrimary: 'عرض الأسعار',
    ctaSecondary: 'تجربة مجانية',
    trust: ['بدون بطاقة للبدء', 'حصص وباقات حسب الاستهلاك', 'واجهة عربية / فرنسية'],
    modulesTitle: 'الوحدات الأساسية',
    modulesSupport: 'كل ما تحتاجه لتسيير نشاطك يومياً.',
    modules: [
      {
        title: 'الفوترة والمحاسبة',
        desc: 'فواتير وعملاء وبنك ووثائق ذكية في مكان واحد.',
        icon: FileText,
      },
      {
        title: 'اللوجستيك و COD',
        desc: 'وصولات التسليم والناقلون وتحصيل الدفع عند الاستلام.',
        icon: Truck,
      },
      {
        title: 'المقاول الذاتي والشخص الذاتي',
        desc: 'أسقف المقاول الذاتي ودفاتر الشخص الذاتي وضريبة الدخل الإرشادية.',
        icon: Briefcase,
      },
      {
        title: 'الخبير المحاسبي الافتراضي',
        desc: 'تدقيق ICE وTVA المغربية وCNSS واتساق المبالغ.',
        icon: Scale,
      },
    ],
    pricingTitle: 'باقات واضحة',
    pricingSupport: 'أربع عروض حسب مرحلتك — مع باقات إضافية عند تجاوز الحصص.',
    tiers: [
      { name: 'مستقل', price: '49 درهماً', hint: '/ شهر · مقاول ذاتي' },
      { name: 'مهنة حرة', price: '149 درهماً', hint: '/ شهر · شخص ذاتي' },
      { name: 'شركات وتجارة إلكترونية', price: '399 درهماً', hint: '/ شهر', popular: true },
      { name: 'Ultimate', price: 'حسب الطلب', hint: 'مكاتب ومحاسبة حسب الاستخدام' },
    ],
    auditTitle: 'التدقيق والامتثال — المغرب',
    auditSupport:
      'شغّل الخبير المحاسبي الافتراضي: نسب TVA 20/14/10/7٪، ICE من 15 رقماً، أسقف المقاول الذاتي والقيد المزدوج.',
    auditPoints: [
      'تنبيهات قابلة للتنفيذ بالعربية والفرنسية',
      'فحص الفواتير والمشتريات والقيود',
      'نقطة امتثال بنقرة واحدة',
    ],
    audiencesTitle: 'لمن؟',
    audiences: ['المقاولون الذاتيون', 'الشركات الصغرى والمتوسطة', 'المحاسبون والمكاتب', 'التجارة الإلكترونية'],
    finalTitle: 'اختر الباقة المناسبة لنشاطك.',
    finalSupport: 'قارن المستقل والمهنة الحرة والشركات وUltimate.',
    finalCta: 'الانتقال إلى الأسعار',
  },
};

export function ZafirixMarketingLanding({ locale }: { locale: MarketingLocale }) {
  const c = COPY[locale];
  const isAr = locale === 'ar';

  useEffect(() => {
    document.documentElement.lang = c.htmlLang;
    document.documentElement.dir = c.dir;
  }, [c.htmlLang, c.dir]);

  useEffect(() => {
    return runWhenIdle(() => {
      trackEvent('view_landing', { locale });
      const code = captureReferralFromWindow();
      if (code) logReferralLandingClick(code);
    });
  }, [locale]);

  return (
    <div className="min-h-dvh flex flex-col bg-[#f4f6fa] overflow-x-hidden" dir={c.dir} lang={c.htmlLang}>
      <header
        className="sticky top-0 z-50 border-b border-white/10 bg-[#0F1F3D]/95 backdrop-blur-md"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <ZafirixLogo size="sm" subtitle subtitleText="ZAFIRIX GROUP" subtitleClassName="text-white/45" />
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={c.altHref}
              className="min-h-10 px-3 inline-flex items-center rounded-xl text-xs font-bold text-white/80 border border-white/15 hover:bg-white/10"
            >
              {c.altLabel}
            </Link>
            <Link
              href={locale === 'ar' ? '/blog?lang=ar' : '/blog'}
              className="inline-flex min-h-10 px-2 sm:px-3 items-center rounded-xl text-xs sm:text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              {c.navBlog}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-10 px-2 sm:px-3 items-center rounded-xl text-xs sm:text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              {c.navPricing}
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-10 px-2 sm:px-3 items-center rounded-xl text-xs sm:text-sm font-semibold text-white/80 hover:bg-white/10"
            >
              {c.navLogin}
            </Link>
            <Link
              href="/pricing"
              className="hidden sm:inline-flex min-h-10 items-center rounded-xl bg-cyan-400 px-3 sm:px-4 text-xs sm:text-sm font-bold text-[#0F1F3D] hover:bg-cyan-300"
            >
              {c.ctaPrimary}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background: 'linear-gradient(145deg, #0F1F3D 0%, #163057 50%, #0e7490 120%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 25%, rgba(34,211,238,0.28), transparent 42%), radial-gradient(circle at 85% 70%, rgba(14,116,144,0.35), transparent 40%)',
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-14 sm:pt-16 sm:pb-20">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-cyan-300/90 mb-3">
            {c.badge}
          </p>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-balance max-w-4xl leading-[1.1]">
            ZAFIRIX<span className="text-cyan-300">PRO</span>
          </h1>
          <p className="mt-4 text-xl sm:text-2xl font-semibold text-white/95 text-balance max-w-3xl">
            {c.headline}
          </p>
          <p className="mt-4 text-sm sm:text-lg text-white/70 max-w-2xl leading-relaxed">{c.support}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href="/pricing"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-7 py-3.5 text-sm sm:text-base font-bold text-[#0F1F3D] shadow-lg shadow-cyan-500/20 hover:bg-cyan-300 active:scale-[0.98]"
            >
              {c.ctaPrimary}
              <ArrowRight size={18} className={isAr ? 'rotate-180' : undefined} />
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              {c.ctaSecondary}
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs sm:text-sm text-white/60">
            {c.trust.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-cyan-300 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Modules */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16 w-full">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D] text-balance">{c.modulesTitle}</h2>
        <p className="mt-2 text-slate-600 max-w-2xl">{c.modulesSupport}</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {c.modules.map((m) => (
            <div
              key={m.title}
              className="rounded-2xl border border-[#0F1F3D]/8 bg-white/90 p-5 shadow-sm"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0F1F3D] text-cyan-300 flex items-center justify-center mb-3">
                <m.icon size={18} />
              </div>
              <h3 className="font-bold text-[#0F1F3D]">{m.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="bg-white border-y border-slate-100 py-14 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D]">{c.pricingTitle}</h2>
          <p className="mt-2 text-slate-600 max-w-2xl">{c.pricingSupport}</p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            {c.tiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl border p-5 ${
                  tier.popular
                    ? 'border-cyan-400 ring-2 ring-cyan-400/40 bg-cyan-50/40'
                    : 'border-slate-200 bg-[#f8fafc]'
                }`}
              >
                {tier.popular ? (
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-cyan-800 mb-2">
                    ★
                  </p>
                ) : null}
                <p className="text-sm font-semibold text-slate-600">{tier.name}</p>
                <p className="mt-2 text-2xl font-extrabold text-[#0F1F3D]">{tier.price}</p>
                <p className="text-xs text-slate-500 mt-1">{tier.hint}</p>
              </div>
            ))}
          </div>
          <Link
            href="/pricing"
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#0F1F3D] px-6 text-sm font-bold text-white hover:bg-[#1B2A4A]"
          >
            {c.ctaPrimary}
            <ArrowRight size={16} className={isAr ? 'rotate-180' : undefined} />
          </Link>
        </div>
      </section>

      {/* Audit */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16 w-full">
        <div className="rounded-3xl border border-[#0F1F3D]/10 bg-[#0F1F3D] text-white p-6 sm:p-10 overflow-hidden relative">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(34,211,238,0.25), transparent 45%)',
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 text-cyan-300 text-sm font-semibold mb-3">
              <Shield size={16} />
              <Sparkles size={16} />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold">{c.auditTitle}</h2>
            <p className="mt-3 text-white/70 max-w-2xl leading-relaxed">{c.auditSupport}</p>
            <ul className="mt-6 space-y-2">
              {c.auditPoints.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-white/85">
                  <CheckCircle2 size={16} className="text-cyan-300 shrink-0 mt-0.5" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 w-full">
        <h2 className="text-xl font-bold text-[#0F1F3D] mb-4">{c.audiencesTitle}</h2>
        <div className="flex flex-wrap gap-2">
          {c.audiences.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#0F1F3D]"
            >
              <Users size={14} className="text-cyan-700" />
              {a}
            </span>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 sm:px-6 pb-24 lg:pb-16">
        <div className="max-w-3xl mx-auto text-center rounded-3xl border border-cyan-200/40 bg-white p-8 sm:p-10 shadow-sm">
          <h2 className="text-2xl font-extrabold text-[#0F1F3D] text-balance">{c.finalTitle}</h2>
          <p className="mt-2 text-slate-600">{c.finalSupport}</p>
          <Link
            href="/pricing"
            className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-8 text-sm font-bold text-[#0F1F3D] hover:bg-cyan-300"
          >
            {c.finalCta}
            <ArrowRight size={18} className={isAr ? 'rotate-180' : undefined} />
          </Link>
        </div>
      </section>

      <div
        className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md p-3 lg:hidden"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/login"
            className="flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-[#0F1F3D]"
          >
            {c.navLogin}
          </Link>
          <Link
            href="/pricing"
            className="flex min-h-12 items-center justify-center rounded-xl bg-[#0F1F3D] text-sm font-bold text-white"
          >
            {c.ctaPrimary}
          </Link>
        </div>
      </div>

      <div className="mt-auto">
        <PublicFooter />
      </div>
    </div>
  );
}

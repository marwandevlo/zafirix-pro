'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  Scale,
  Sparkles,
  Truck,
} from 'lucide-react';
import { PublicFooter } from '@/app/components/public/PublicFooter';
import { ZafirixLogo } from '@/app/components/branding/ZafirixLogo';
import { trackEvent } from '@/app/lib/analytics-track';
import {
  ZAFIRIX_PUBLIC_TIERS,
  type ZafirixPublicTier,
} from '@/app/lib/zafirix-public-pricing';

const TIER_ICON = {
  INDEPENDANT: Briefcase,
  PERSONNE_PHYSIQUE: Scale,
  PME: Truck,
  ULTIMATE: Building2,
} as const;

const FAQ_ITEMS = [
  {
    q: 'Pourquoi quatre offres ?',
    a: 'Indépendant et Profession Libérale couvrent les solos. PME & E-commerce est le forfait le plus choisi (volume + logistique). Ultimate est sur mesure pour cabinets et groupes.',
  },
  {
    q: 'Que se passe-t-il si j’atteins mon quota ?',
    a: 'Vous pouvez acheter un pack pay-as-you-go (factures, expéditions, IA) depuis le tableau de bord, ou passer au forfait supérieur — sans coupure brutale.',
  },
  {
    q: 'Puis-je changer de forfait en cours de mois ?',
    a: 'Oui. Les compteurs mensuels et les packs add-on restent visibles dans « Utilisation & Forfait ».',
  },
  {
    q: 'ZAFIRIX PRO remplace-t-il mon expert-comptable ?',
    a: 'Non. La plateforme structure et accélère ; les décisions engageantes restent avec votre conseil.',
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  useEffect(() => {
    trackEvent('view_pricing');
  }, []);

  const goTrial = () => {
    trackEvent('click_signup', { source: 'pricing' });
    router.push('/signup');
  };

  const goTier = (tier: ZafirixPublicTier) => {
    trackEvent('upgrade_clicked', { surface: 'pricing', target: 'tier', planId: tier.code });
    if (tier.ctaHref.startsWith('mailto:')) {
      window.location.href = tier.ctaHref;
      return;
    }
    router.push(tier.ctaHref);
  };

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col overflow-x-hidden">
      <header
        className="relative overflow-hidden text-white"
        style={{
          background: 'linear-gradient(145deg, #0F1F3D 0%, #152a4f 45%, #0c4a6e 100%)',
          paddingTop: 'max(2.5rem, env(safe-area-inset-top))',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(34,211,238,0.25), transparent 42%), radial-gradient(circle at 85% 75%, rgba(14,116,144,0.35), transparent 40%)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-14 sm:pt-14 sm:pb-20 text-center">
          <div className="flex justify-center mb-5">
            <ZafirixLogo size="md" subtitle subtitleText="ZAFIRIX GROUP · Maroc" subtitleClassName="text-white/45" />
          </div>
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-cyan-300/90 mb-3">
            Forfaits Zafirixpro
          </p>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-balance max-w-3xl mx-auto leading-tight">
            Quatre forfaits clairs — du solo à l&apos;entreprise.
          </h1>
          <p className="mt-4 text-sm sm:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
            Indépendant, Profession Libérale, PME &amp; E-commerce, Ultimate. Quotas visibles, packs
            pay-as-you-go quand vous dépassez.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <button
              type="button"
              onClick={goTrial}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-8 py-3.5 text-sm font-bold text-[#0F1F3D] shadow-lg shadow-cyan-500/20 active:scale-[0.98] hover:bg-cyan-300 transition-all"
            >
              <Sparkles size={18} />
              Essai 7 jours — sans carte
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}
              className="min-h-12 text-sm font-semibold text-white/85 hover:text-white underline-offset-4 hover:underline"
            >
              Voir les forfaits
            </button>
          </div>
        </div>
      </header>

      <section id="plans" className="max-w-6xl mx-auto px-3 sm:px-6 -mt-8 sm:-mt-12 pb-10 relative z-10 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 items-stretch">
          {ZAFIRIX_PUBLIC_TIERS.map((tier) => (
            <TierCard key={tier.code} tier={tier} onSelect={() => goTier(tier)} onTrial={goTrial} />
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-3 sm:px-6 pb-12 w-full">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-[#0F1F3D]/[0.03]">
            <h2 className="text-base sm:text-lg font-bold text-[#0F1F3D]">Comparatif rapide</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">Prix mensuels TTC indicatifs — MAD.</p>
          </div>
          {/* Mobile: stacked cards */}
          <div className="sm:hidden divide-y divide-slate-100">
            {ZAFIRIX_PUBLIC_TIERS.map((t) => (
              <div key={t.code} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 text-sm">{t.nameFr}</p>
                  {t.popular ? (
                    <span className="text-[10px] font-bold uppercase text-cyan-800 bg-cyan-100 px-2 py-0.5 rounded-full">
                      Populaire
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">{t.subtitleFr}</p>
                <p className="text-lg font-extrabold text-[#0F1F3D]">
                  {t.priceLabelFr}
                  <span className="text-xs font-medium text-slate-400 ml-1">{t.priceHintFr}</span>
                </p>
                <button
                  type="button"
                  onClick={() => goTier(t)}
                  className="w-full min-h-11 rounded-xl bg-[#0F1F3D] text-white text-sm font-semibold"
                >
                  {t.ctaLabel}
                </button>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto mobile-scroll-x">
            <table className="min-w-full w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-semibold">Forfait</th>
                  <th className="px-5 py-3 font-semibold">Prix</th>
                  <th className="px-5 py-3 font-semibold">Cible</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {ZAFIRIX_PUBLIC_TIERS.map((t) => (
                  <tr key={t.code} className={`border-t border-slate-100 ${t.popular ? 'bg-cyan-50/40' : ''}`}>
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      {t.nameFr}
                      {t.popular ? (
                        <span className="ml-2 text-[10px] uppercase font-bold text-cyan-800 bg-cyan-100 px-2 py-0.5 rounded-full">
                          Populaire
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      {t.priceLabelFr} <span className="text-slate-400">{t.priceHintFr}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{t.subtitleFr}</td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => goTier(t)}
                        className="min-h-10 px-4 rounded-xl bg-[#0F1F3D] text-white text-xs font-bold hover:bg-[#1B2A4A]"
                      >
                        {t.ctaLabel}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-12 max-w-2xl mx-auto">
          <h2 className="text-lg sm:text-xl font-bold text-[#0F1F3D] text-center mb-6">FAQ</h2>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFaqOpen((o) => (o === i ? null : i))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 min-h-12 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  {item.q}
                  <ChevronDown
                    size={18}
                    className={`text-slate-400 shrink-0 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {faqOpen === i ? (
                  <div className="px-4 pb-3.5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/50 pt-3">
                    {item.a}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 text-center pb-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <a href="mailto:contact@zafirix.group" className="text-sm font-medium text-cyan-700 hover:underline">
            contact@zafirix.group
          </a>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="block w-full mt-4 min-h-11 text-sm text-slate-400 hover:text-slate-600"
          >
            ← Tableau de bord
          </button>
        </div>
      </section>

      <div className="mt-auto">
        <PublicFooter />
      </div>
    </div>
  );
}

function TierCard({
  tier,
  onSelect,
  onTrial,
}: {
  tier: ZafirixPublicTier;
  onSelect: () => void;
  onTrial: () => void;
}) {
  const Icon = TIER_ICON[tier.code];
  const isUltimate = tier.code === 'ULTIMATE';

  return (
    <article
      className={`relative flex flex-col rounded-2xl border bg-white shadow-md transition-all duration-300 hover:shadow-xl h-full ${
        tier.popular
          ? 'border-cyan-400 ring-2 ring-cyan-400/50 sm:scale-[1.02] z-10'
          : 'border-slate-200'
      }`}
    >
      {tier.popular ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-400 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#0F1F3D] shadow whitespace-nowrap">
          Le plus populaire
        </div>
      ) : null}
      <div
        className={`h-1.5 w-full shrink-0 rounded-t-2xl ${
          tier.popular ? 'bg-cyan-400' : isUltimate ? 'bg-[#0F1F3D]' : 'bg-slate-300'
        }`}
      />
      <div className="p-5 sm:p-6 flex-1 flex flex-col">
        <div className="w-11 h-11 rounded-xl bg-[#0F1F3D] flex items-center justify-center text-cyan-300 shadow-md">
          <Icon size={22} />
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-cyan-700">{tier.subtitleFr}</p>
        <h2 className="mt-1 text-lg font-bold text-[#0F1F3D] leading-snug">{tier.nameFr}</h2>
        <p className="mt-1.5 text-sm text-slate-500 leading-snug">{tier.taglineFr}</p>

        <div className="mt-5">
          <p className="font-extrabold text-[#0F1F3D] tracking-tight text-3xl">
            {tier.priceLabelFr}
            {tier.priceMadMonth != null ? (
              <span className="text-sm font-semibold text-slate-400 ml-1">{tier.priceHintFr}</span>
            ) : (
              <span className="block text-sm font-semibold text-cyan-700 mt-1">{tier.priceHintFr}</span>
            )}
          </p>
        </div>

        <ul className="mt-5 space-y-2 flex-1">
          {tier.benefitsFr.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
              <CheckCircle2 size={16} className="text-cyan-600 shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={onSelect}
            className={`w-full min-h-12 py-3.5 rounded-xl font-bold text-sm shadow-md active:scale-[0.98] transition-colors ${
              tier.popular
                ? 'bg-cyan-400 text-[#0F1F3D] hover:bg-cyan-300'
                : 'bg-[#0F1F3D] text-white hover:bg-[#1B2A4A]'
            }`}
          >
            {tier.ctaLabel}
          </button>
          <button
            type="button"
            onClick={onTrial}
            className="w-full min-h-11 py-3 rounded-xl font-semibold text-sm border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {tier.secondaryCtaLabel ?? 'Essai gratuit'}
          </button>
        </div>
      </div>
    </article>
  );
}

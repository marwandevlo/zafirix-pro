'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  Crown,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  Building2,
} from 'lucide-react';
import { PublicFooter } from '@/app/components/public/PublicFooter';
import { ZafirixLogo } from '@/app/components/branding/ZafirixLogo';
import {
  getFunnelPlanPresentations,
  monthlyEquivalentMad,
  formatLimit,
  formatPriceMadYear,
  type FunnelPlanPresentation,
} from '@/app/lib/atlas-pricing-funnel';
import { ATLAS_COMPANY_SLOT_ADDONS } from '@/app/lib/atlas-company-addons';
import { trackEvent } from '@/app/lib/analytics-track';
import { ATLAS_INCIDENT_HOTFIX_GROWTH } from '@/app/lib/atlas-hotfix';
import { ManualPaymentModal } from '@/app/components/pricing/ManualPaymentModal';
import { PricingRoiCalculator } from '@/app/components/pricing/PricingRoiCalculator';
import { PricingFeatureMatrix } from '@/app/components/pricing/PricingFeatureMatrix';
import type { FunnelPlanId } from '@/app/lib/atlas-pricing-funnel';

const planIconById: Record<string, typeof Rocket> = {
  starter: Rocket,
  pro: Crown,
  enterprise: Building2,
};

const planAccent: Record<string, { ring: string; bar: string; iconBg: string }> = {
  starter: { ring: 'border-slate-200', bar: 'from-slate-400 to-slate-500', iconBg: 'bg-slate-600' },
  pro: { ring: 'border-amber-300 ring-2 ring-amber-400/80', bar: 'from-amber-400 to-orange-500', iconBg: 'bg-amber-500' },
  enterprise: { ring: 'border-violet-200', bar: 'from-violet-700 to-indigo-800', iconBg: 'bg-violet-700' },
};

const FAQ_ITEMS = [
  {
    q: 'Pourquoi trois offres ?',
    a: 'Starter ouvre la porte à faible coût. Pro concentre ~80 % des outils quotidiens — c’est le choix le plus fréquent. Ultimate ancre la valeur pour les groupes exigeant audit, gouvernance et IA avancée.',
  },
  {
    q: 'Les modules « verrouillés » sont-ils inutiles sur Starter ?',
    a: 'Non — ils représentent des gains mesurables (pénalités évitées, recouvrement). Utilisez le calculateur ROI pour estimer votre coût d’inaction.',
  },
  {
    q: 'Puis-je upgrader en cours d’année ?',
    a: 'Oui. Les prompts intelligents vous guident dès 75 % d’un quota (factures, opérations, IA).',
  },
  {
    q: 'ZAFIRIX PRO remplace-t-il mon expert-comptable ?',
    a: 'Non. L’outil structure et accélère ; les décisions engageantes restent avec votre conseil.',
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [manualModal, setManualModal] = useState<{ planId: string } | null>(null);
  const funnelPlans = useMemo(() => getFunnelPlanPresentations(), []);

  useEffect(() => {
    trackEvent('view_pricing');
  }, []);

  const goTrial = () => {
    trackEvent('click_signup', { source: 'pricing' });
    router.push('/signup');
  };
  const goPay = (planId: string) => {
    trackEvent('upgrade_clicked', { surface: 'pricing', target: 'checkout', planId });
    router.push(`/payment?plan=${encodeURIComponent(planId)}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {!ATLAS_INCIDENT_HOTFIX_GROWTH && manualModal ? (
        <ManualPaymentModal open planId={manualModal.planId} onClose={() => setManualModal(null)} />
      ) : null}

      <header className="relative overflow-hidden bg-linear-to-br from-[#0b1428] via-[#121f3d] to-[#1a1040] text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 30%, rgba(99,102,241,0.35), transparent 45%), radial-gradient(circle at 90% 70%, rgba(245,158,11,0.15), transparent 40%)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-16 sm:pb-20 text-center">
          <div className="flex justify-center mb-6">
            <ZafirixLogo size="md" subtitle subtitleText="ZAFIRIX GROUP · Maroc" subtitleClassName="text-white/45" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/90 mb-3">
            Architecture tarifaire Atlas OS
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-balance max-w-3xl mx-auto">
            Investissez là où le ROI est visible — pas dans des cases cochées.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
            Starter pour entrer. Pro pour produire. Ultimate pour dominer conformité &amp; gouvernance.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={goTrial}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-8 py-3.5 text-sm font-bold text-[#0b1428] shadow-lg shadow-amber-500/20 hover:bg-amber-300 transition-all hover:scale-[1.02]"
            >
              <Sparkles size={18} />
              Essai 7 jours — sans carte
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('roi-calculator')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-sm font-semibold text-white/80 hover:text-white underline-offset-4 hover:underline"
            >
              Calculer mon ROI
            </button>
          </div>
        </div>
      </header>

      <section id="plans" className="max-w-6xl mx-auto px-4 sm:px-6 -mt-10 sm:-mt-12 pb-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6 items-stretch">
          {funnelPlans.map((fp) => (
            <FunnelPlanCard
              key={fp.plan.id}
              fp={fp}
              onTrial={goTrial}
              onPay={goPay}
              onManual={ATLAS_INCIDENT_HOTFIX_GROWTH ? undefined : () => setManualModal({ planId: fp.plan.id })}
            />
          ))}
        </div>
      </section>

      <section id="roi-calculator" className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <PricingRoiCalculator onSelectPlan={(id) => goPay(id)} />
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <PricingFeatureMatrix />
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div
          id="pro-extensions"
          className="mt-6 rounded-2xl border border-indigo-100 bg-linear-to-br from-indigo-50/90 to-white p-6 sm:p-8 shadow-sm"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Extensions Pro</p>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-2">Plus de sociétés sur Pro</h2>
          <p className="text-sm text-slate-600 mt-2 max-w-2xl">
            Pro inclut <strong>25 sociétés</strong>. Extensions +3 / +5 facturées à part.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
            {ATLAS_COMPANY_SLOT_ADDONS.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col">
                <p className="text-xs font-semibold text-slate-400 uppercase">{a.labelFr}</p>
                <p className="text-lg font-extrabold text-indigo-700 mt-4">
                  {a.priceMadYear.toLocaleString('fr-MA')} MAD<span className="text-slate-400 font-normal text-sm">/an</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    trackEvent('upgrade_clicked', { surface: 'pricing', target: 'addon', addonId: a.id });
                    router.push(`/payment?addon=${encodeURIComponent(a.id)}`);
                  }}
                  className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Commander
                </button>
              </div>
            ))}
          </div>
        </div>

        <div id="pricing-compare" className="mt-10 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-5 border-b border-slate-100 bg-slate-50/80">
            <h2 className="text-lg font-bold text-slate-900">Limites &amp; volumes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-semibold">Offre</th>
                  <th className="px-5 py-3 font-semibold">Prix / an</th>
                  <th className="px-5 py-3 font-semibold">/ mois</th>
                  <th className="px-5 py-3 font-semibold">Sociétés</th>
                  <th className="px-5 py-3 font-semibold">Utilisateurs</th>
                </tr>
              </thead>
              <tbody>
                {funnelPlans.map(({ plan, badge }) => (
                  <tr key={plan.id} className={`border-t border-slate-100 ${badge === 'most_popular' ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      {plan.name}
                      {badge === 'most_popular' && (
                        <span className="ml-2 text-[10px] uppercase font-bold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-full">
                          Plus populaire
                        </span>
                      )}
                      {badge === 'enterprise_standard' && (
                        <span className="ml-2 text-[10px] uppercase font-bold text-violet-800 bg-violet-100 px-2 py-0.5 rounded-full">
                          Standard entreprise
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">{formatPriceMadYear(plan.price)}</td>
                    <td className="px-5 py-3">{monthlyEquivalentMad(plan)}</td>
                    <td className="px-5 py-3">{formatLimit(plan.companiesLimit)}</td>
                    <td className="px-5 py-3">{formatLimit(plan.usersLimit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-14 max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-slate-900 text-center mb-8">FAQ</h2>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFaqOpen((o) => (o === i ? null : i))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  {item.q}
                  <ChevronDown size={18} className={`text-slate-400 shrink-0 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} />
                </button>
                {faqOpen === i && (
                  <div className="px-4 pb-3.5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/50 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 text-center">
          <a href="mailto:contact@zafirix.group" className="text-sm font-medium text-indigo-600 hover:underline">
            contact@zafirix.group
          </a>
          <button type="button" onClick={() => router.push('/')} className="block w-full mt-4 text-sm text-slate-400 hover:text-slate-600">
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

function FunnelPlanCard({
  fp,
  onTrial,
  onPay,
  onManual,
}: {
  fp: FunnelPlanPresentation;
  onTrial: () => void;
  onPay: (planId: string) => void;
  onManual?: () => void;
}) {
  const { plan, isMostPopular, badge, premiumHighlightsFr, anchorNoteFr } = fp;
  const Icon = planIconById[plan.id] ?? Rocket;
  const accent = planAccent[plan.id] ?? planAccent.starter;
  const isPro = plan.id === 'pro';
  const isEnterprise = plan.id === 'enterprise';

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white shadow-md transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 h-full ${accent.ring} ${
        isPro ? 'lg:scale-[1.03] shadow-xl z-10' : isEnterprise ? 'opacity-[0.98]' : ''
      }`}
    >
      {badge === 'most_popular' && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-linear-to-r from-amber-400 to-orange-400 px-4 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#0b1428] shadow whitespace-nowrap">
          ⭐ Le plus populaire
        </div>
      )}
      {badge === 'enterprise_standard' && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-linear-to-r from-violet-600 to-indigo-700 px-4 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow whitespace-nowrap">
          Standard entreprise
        </div>
      )}
      <div className={`h-1.5 w-full bg-linear-to-r shrink-0 rounded-t-2xl ${accent.bar}`} />
      <div className="p-6 sm:p-7 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className={`w-12 h-12 rounded-xl ${accent.iconBg} flex items-center justify-center text-white shadow-md`}>
            <Icon size={24} />
          </div>
          {isEnterprise && (
            <span className="text-[10px] font-bold uppercase text-violet-600 bg-violet-50 px-2 py-1 rounded-lg border border-violet-100">
              Ancre valeur
            </span>
          )}
        </div>
        <h2 className="mt-5 text-lg font-bold text-slate-900 leading-snug">{fp.personaTitleFr}</h2>
        <p className="mt-1 text-sm text-slate-500">{fp.taglineFr}</p>
        <div className="mt-5">
          <p className={`font-extrabold text-slate-900 tracking-tight ${isEnterprise ? 'text-2xl sm:text-3xl' : 'text-3xl'}`}>
            {formatPriceMadYear(plan.price)}
          </p>
          <p className="text-sm text-indigo-600 font-semibold mt-1">
            {monthlyEquivalentMad(plan)} <span className="text-slate-400 font-normal">/ an facturé</span>
          </p>
        </div>
        <ul className="mt-6 space-y-2.5 flex-1">
          {fp.benefitsFr.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
          {premiumHighlightsFr.length > 0 && (
            <li className="pt-3 mt-2 border-t border-slate-100 space-y-1.5">
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Réservé offre supérieure</p>
              {premiumHighlightsFr.map((label) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Lock size={12} /> {label}
                </span>
              ))}
            </li>
          )}
          <li className="flex items-start gap-2 text-sm text-slate-500 pt-2 border-t border-slate-100">
            <ShieldCheck size={16} className="text-slate-400 shrink-0 mt-0.5" />
            <span>
              Jusqu&apos;à <strong>{formatLimit(plan.operationsLimit)}</strong> opérations
            </span>
          </li>
        </ul>
        {anchorNoteFr && (
          <p className="mt-4 text-xs text-violet-700/80 bg-violet-50 rounded-lg px-3 py-2 border border-violet-100">{anchorNoteFr}</p>
        )}
        <div className="mt-8 space-y-2">
          <button
            type="button"
            onClick={() => onPay(plan.id)}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-colors shadow-md ${
              isPro
                ? 'bg-amber-500 text-[#0b1428] hover:bg-amber-400'
                : 'bg-[#0f1a32] text-white hover:bg-[#1a2a4a]'
            }`}
          >
            {isEnterprise ? 'Contacter / Choisir Ultimate' : 'Choisir cette offre'}
          </button>
          <button type="button" onClick={onTrial} className="w-full py-3 rounded-xl font-semibold text-sm border border-slate-200 text-slate-700 hover:bg-slate-50">
            Essai gratuit 7 jours
          </button>
          {onManual && (
            <button type="button" onClick={onManual} className="w-full py-2.5 text-sm text-slate-600 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50">
              Paiement manuel (Maroc)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

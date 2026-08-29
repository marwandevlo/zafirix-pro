'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Gift,
  Globe,
  Loader2,
  Menu,
  MessageCircle,
  MousePointerClick,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { AppSidebar, AppSidebarMobileOverlay } from '@/app/components/shell/AppSidebar';
import { MobileBottomNav } from '@/app/components/shell/MobileBottomNav';
import { MadAmount } from '@/app/components/ui/MadAmount';
import { openWhatsAppReferralShareText, buildReferralShareTextBilingual } from '@/app/lib/atlas-referral-client';
import { trackEvent } from '@/app/lib/analytics-track';
import type { AtlasUiLocale } from '@/app/lib/atlas-format';

type Tier = {
  id: string;
  minActivated: number;
  percent: number;
  labelFr: string;
  labelAr: string;
  hintFr: string;
  hintAr: string;
};

type Tx = {
  id: string;
  source: string;
  paymentAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  currency: string;
  status: string;
  tierId: string;
  createdAt: string;
};

type DashboardPayload = {
  ok?: boolean;
  code?: string;
  referralLink?: string;
  signupUrl?: string;
  clicks?: number;
  signups?: number;
  activeReferrals?: number;
  pendingEarnings?: number;
  paidOut?: number;
  lifetimeEarned?: number;
  currentPercent?: number;
  currentTier?: Tier;
  nextTier?: Tier | null;
  tiers?: Tier[];
  planRates?: Array<{ planId: string; percent: number }>;
  transactions?: Tx[];
};

const PLAN_LABEL: Record<string, { fr: string; ar: string }> = {
  starter: { fr: 'Starter', ar: 'Starter' },
  growth: { fr: 'Growth', ar: 'Growth' },
  pro: { fr: 'Pro', ar: 'Pro' },
  business: { fr: 'Business', ar: 'Business' },
  advanced: { fr: 'Advanced', ar: 'Advanced' },
  enterprise: { fr: 'Enterprise', ar: 'Enterprise' },
};

function statusLabel(status: string, t: (fr: string, ar: string) => string): string {
  if (status === 'paid') return t('Versé', 'مدفوع');
  if (status === 'reversed') return t('Annulé', 'ملغى');
  if (status === 'credited') return t('Validé', 'مؤكد');
  return t('En attente', 'معلق');
}

export function AffiliateDashboardClient() {
  const [lang, setLang] = useState<AtlasUiLocale>('fr');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/affiliate/dashboard', { credentials: 'include' });
      const json = (await res.json().catch(() => ({}))) as DashboardPayload;
      if (res.ok && json?.ok) setData(json);
      else setData(null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const link = data?.referralLink ?? '';
  const code = data?.code ?? '';
  const clicks = data?.clicks ?? 0;
  const active = data?.activeReferrals ?? 0;
  const pending = data?.pendingEarnings ?? 0;
  const paid = data?.paidOut ?? 0;
  const lifetime = data?.lifetimeEarned ?? 0;
  const currentPercent = data?.currentPercent ?? data?.currentTier?.percent ?? 20;
  const currentTier = data?.currentTier;
  const nextTier = data?.nextTier ?? null;
  const tiers = data?.tiers ?? [];
  const transactions = data?.transactions ?? [];
  const toNext = nextTier ? Math.max(0, nextTier.minActivated - active) : 0;

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      trackEvent('affiliate_link_copied', { surface: 'affiliate_dashboard' });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const shareWhatsApp = () => {
    if (!link) return;
    trackEvent('referral_share_clicked', { surface: 'affiliate_dashboard' });
    openWhatsAppReferralShareText(buildReferralShareTextBilingual(link));
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[#0F1F3D]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <AppSidebarMobileOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
      <AppSidebar
        variant="module"
        lang={lang}
        setLang={setLang}
        t={t}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onNavigate={() => setMenuOpen(false)}
      />

      <main className="flex-1 min-w-0 overflow-y-auto overscroll-contain">
        <div
          className="relative px-4 sm:px-6 lg:px-8 pt-6 pb-10"
          style={{
            background:
              'radial-gradient(circle at 12% 0%, rgba(6,182,212,0.28), transparent 42%), radial-gradient(circle at 90% 20%, rgba(14,116,144,0.35), transparent 40%), #0F1F3D',
          }}
        >
          <div className="max-w-6xl mx-auto space-y-6 pb-mobile-nav lg:pb-0">
            <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/15"
                    aria-label={t('Menu', 'القائمة')}
                  >
                    <Menu size={20} />
                  </button>
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/90">
                  Zafirixpro
                </p>
                <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
                  <Gift className="text-[#06b6d4] shrink-0" size={26} />
                  {t('Programme affilié', 'برنامج الإحالة')}
                </h1>
                <p className="mt-1.5 text-sm text-white/65 max-w-xl">
                  {t(
                    'Partagez votre lien, suivez les clics et gagnez jusqu’à 40 % sur chaque abonnement payé.',
                    'شارك رابطك، تابع النقرات واربح حتى 40٪ على كل اشتراك مدفوع.',
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="inline-flex rounded-xl border border-white/15 bg-white/8 p-0.5">
                  <button
                    type="button"
                    onClick={() => setLang('fr')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${lang === 'fr' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/60'}`}
                  >
                    FR
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('ar')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${lang === 'ar' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/60'}`}
                  >
                    AR
                  </button>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right">
                  <p className="text-[10px] uppercase tracking-wide text-white/50">
                    {t('Votre palier', 'مستواك')}
                  </p>
                  <p className="text-2xl font-extrabold text-[#06b6d4] tabular-nums">{currentPercent}%</p>
                  <p className="text-xs text-white/70">
                    {currentTier ? t(currentTier.labelFr, currentTier.labelAr) : '—'}
                  </p>
                </div>
              </div>
            </header>

            <section className="rounded-3xl border border-white/10 bg-white/95 p-4 sm:p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <Globe size={16} className="text-[#06b6d4]" />
                <h2 className="text-sm font-bold text-[#0F1F3D]">
                  {t('Votre lien de parrainage', 'رابط الإحالة الخاص بك')}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                {t(
                  'Les visiteurs qui arrivent avec ?ref= sont rattachés à votre compte. Commission créditée à chaque paiement.',
                  'الزوار القادمون بـ ?ref= يُربطون بحسابك. تُحتسب العمولة عند كل دفعة.',
                )}
              </p>
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="flex-1 min-w-0 rounded-2xl border border-slate-200 bg-[#0F1F3D] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wide text-cyan-300/80 mb-1">
                    {t('Lien public', 'الرابط العام')}
                  </p>
                  <p className="text-sm sm:text-base font-mono text-white break-all notranslate" translate="no">
                    {loading ? '…' : link || '—'}
                  </p>
                  {code ? (
                    <p className="mt-1 text-[11px] text-white/50">
                      {t('Code', 'الرمز')} · <span className="font-semibold text-cyan-200 notranslate" translate="no">{code}</span>
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!link}
                    onClick={() => void copyLink()}
                    className="inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-2xl bg-[#06b6d4] text-[#0F1F3D] font-bold hover:bg-cyan-300 disabled:opacity-50"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? t('Copié !', 'تم النسخ!') : t('Copier le lien', 'نسخ الرابط')}
                  </button>
                  <button
                    type="button"
                    disabled={!link}
                    onClick={shareWhatsApp}
                    className="inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-2xl bg-[#25D366] text-white font-bold hover:bg-[#1ebe5a] disabled:opacity-50"
                  >
                    <MessageCircle size={16} />
                    WhatsApp
                  </button>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  label: t('Clics totaux', 'إجمالي النقرات'),
                  value: String(clicks),
                  icon: MousePointerClick,
                  money: false,
                },
                {
                  label: t('Filleuls actifs', 'إحالات نشطة'),
                  value: String(active),
                  icon: Users,
                  money: false,
                },
                {
                  label: t('Gains en attente', 'أرباح معلّقة'),
                  value: pending,
                  icon: Wallet,
                  money: true,
                },
                {
                  label: t('Montants versés', 'المبالغ المدفوعة'),
                  value: paid,
                  icon: Trophy,
                  money: true,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-white/10 bg-white/8 backdrop-blur px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-white/60 font-medium">{card.label}</p>
                    <card.icon size={15} className="text-[#06b6d4]" />
                  </div>
                  <p className="mt-2 text-xl sm:text-2xl font-bold text-white tabular-nums">
                    {card.money ? <MadAmount value={Number(card.value)} locale={lang} /> : card.value}
                  </p>
                </div>
              ))}
            </section>

            <p className="text-xs text-white/50">
              {t('Cumul lifetime', 'الإجمالي التراكمي')} · <MadAmount value={lifetime} locale={lang} />
              {nextTier
                ? ` · ${t(`Encore ${toNext} activation(s) pour ${nextTier.percent} %`, `تبقّى ${toNext} تفعيل للوصول إلى ${nextTier.percent}٪`)}`
                : ` · ${t('Palier maximum atteint', 'بلغتَ أعلى مستوى')}`}
            </p>

            <section>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-[#06b6d4]" />
                <h2 className="text-sm font-bold text-white">
                  {t('Paliers de commission', 'مستويات العمولة')}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {tiers.map((tier) => {
                  const activeTier = currentTier?.id === tier.id;
                  return (
                    <div
                      key={tier.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        activeTier
                          ? 'border-[#06b6d4] bg-[#06b6d4] text-[#0F1F3D] shadow-lg shadow-cyan-500/20'
                          : 'border-white/10 bg-white/6 text-white'
                      }`}
                    >
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${activeTier ? 'text-[#0F1F3D]/70' : 'text-white/50'}`}>
                        {t(tier.labelFr, tier.labelAr)}
                      </p>
                      <p className="mt-1 text-3xl font-extrabold tabular-nums">{tier.percent}%</p>
                      <p className={`mt-1 text-[11px] leading-snug ${activeTier ? 'text-[#0F1F3D]/75' : 'text-white/55'}`}>
                        {t(tier.hintFr, tier.hintAr)}
                      </p>
                      {activeTier ? (
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wide">
                          {t('Palier actuel', 'المستوى الحالي')}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-white/45">
                {t(
                  'Le taux appliqué à un paiement est le plus élevé entre votre palier et le forfait souscrit par le filleul (Starter 20 % → Enterprise 40 %).',
                  'النسبة المطبّقة على الدفعة هي الأعلى بين مستواك وخطة المشترك (Starter 20٪ → Enterprise 40٪).',
                )}
              </p>
            </section>

            {data?.planRates && data.planRates.length > 0 ? (
              <section className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                <h3 className="text-xs font-bold text-white mb-3">
                  {t('Taux selon le forfait du filleul', 'النسبة حسب خطة المُحال')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {data.planRates.map((row) => (
                    <span
                      key={row.planId}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs text-white"
                    >
                      {PLAN_LABEL[row.planId]?.[lang] ?? row.planId}
                      <strong className="text-[#06b6d4]">{row.percent}%</strong>
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-3xl border border-white/10 bg-white overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#0F1F3D]">
                  {t('Historique des commissions', 'سجل العمولات')}
                </h2>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="text-xs font-semibold text-cyan-700 hover:underline"
                >
                  {t('Actualiser', 'تحديث')}
                </button>
              </div>
              {loading ? (
                <div className="flex justify-center py-12 text-slate-400">
                  <Loader2 className="animate-spin" size={22} />
                </div>
              ) : transactions.length === 0 ? (
                <p className="px-5 py-10 text-sm text-slate-400 text-center">
                  {t(
                    'Aucune commission pour le moment. Partagez votre lien — le premier paiement d’un filleul apparaîtra ici.',
                    'لا توجد عمولات بعد. شارك رابطك — ستظهر هنا أول دفعة لمُحال.',
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2.5 font-medium">{t('Date', 'التاريخ')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('Source', 'المصدر')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('Taux', 'النسبة')}</th>
                        <th className="px-4 py-2.5 font-medium text-right">{t('Paiement', 'الدفع')}</th>
                        <th className="px-4 py-2.5 font-medium text-right">{t('Commission', 'العمولة')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('Statut', 'الحالة')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {tx.createdAt
                              ? new Date(tx.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-MA')
                              : '—'}
                          </td>
                          <td className="px-4 py-3 capitalize text-slate-700">{tx.source || '—'}</td>
                          <td className="px-4 py-3 font-semibold text-[#0F1F3D]">{tx.commissionPercent}%</td>
                          <td className="px-4 py-3 text-right">
                            <MadAmount value={tx.paymentAmount} locale={lang} />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-cyan-700">
                            <MadAmount value={tx.commissionAmount} locale={lang} />
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 text-[11px] font-semibold">
                              {statusLabel(tx.status, t)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

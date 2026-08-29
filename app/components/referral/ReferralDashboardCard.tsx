'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gift, MessageCircle, Sparkles, Trophy } from 'lucide-react';
import { ATLAS_INCIDENT_HOTFIX_GROWTH } from '@/app/lib/atlas-hotfix';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { trackEvent } from '@/app/lib/analytics-track';
import { buildReferralShareTextBilingual, openWhatsAppReferralShareText } from '@/app/lib/atlas-referral-client';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';

export type ReferralMePayload = {
  ok?: boolean;
  signupUrl?: string;
  activatedReferrals?: number;
  nextMilestone?: number | null;
  progressLabel?: string;
  progressBarPercent?: number;
  currentTierRewardDays?: number;
  maxTierReached?: boolean;
  bonusFeaturesUnlocked?: boolean;
  commissionPercent?: number;
  lifetimeEarned?: number;
  availableBalance?: number;
  earningsCurrency?: string;
};

type Props = {
  lang: 'fr' | 'ar';
  /** When true, render a denser layout (e.g. modal). */
  compact?: boolean;
};

const REFRESH_EVENT = 'zafirix-referral-refresh';

export function ReferralDashboardCard({ lang, compact = false }: Props) {
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);
  const [data, setData] = useState<ReferralMePayload | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isAtlasSupabaseDataEnabled()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/referral/me', { credentials: 'include' });
      const json = (await res.json().catch(() => ({}))) as ReferralMePayload;
      if (res.ok && json?.ok) setData(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [load]);

  if (ATLAS_INCIDENT_HOTFIX_GROWTH) return null;

  const share = (surface: string) => {
    const link = (data?.signupUrl ?? '').trim();
    if (!link) return;
    trackEvent('referral_share_clicked', { surface });
    openWhatsAppReferralShareText(buildReferralShareTextBilingual(link));
  };

  if (!isAtlasSupabaseDataEnabled()) return null;

  const link = data?.signupUrl ?? '';
  const n = data?.activatedReferrals ?? 0;
  const label = data?.progressLabel ?? '0/1';
  const pct = Math.min(100, Math.max(0, data?.progressBarPercent ?? 0));
  const days = data?.currentTierRewardDays ?? 0;
  const maxed = data?.maxTierReached ?? false;
  const bonus = data?.bonusFeaturesUnlocked ?? false;
  const commissionPercent = data?.commissionPercent ?? 20;
  const available = data?.availableBalance ?? 0;
  const lifetime = data?.lifetimeEarned ?? 0;

  return (
    <div
      className={`rounded-2xl border border-emerald-200/80 bg-linear-to-br from-emerald-50 via-white to-amber-50/40 shadow-sm ${
        compact ? 'p-4' : 'p-5 sm:p-6'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Gift size={22} />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-950">
                {t('Parrainage ZAFIRIX PRO', 'إحالة ZAFIRIX PRO')}
              </p>
              <p className="text-xs text-emerald-900/80">
                {t('Partagez votre lien — récompenses instantanées à chaque palier.', 'شارك الرابط — مكافآت فورية عند كل مرحلة.')}
              </p>
            </div>
          </div>

          <ul className={`space-y-1.5 text-xs sm:text-sm text-slate-800 ${compact ? '' : 'sm:text-[13px]'}`}>
            <li className="flex items-center gap-2">
              <Trophy className="text-amber-600 shrink-0" size={16} />
              <span>
                <strong>1</strong> {t('parrain actif', 'إحالة مفعّلة')} → <strong>+7</strong> {t('jours', 'أيام')}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Trophy className="text-amber-600 shrink-0" size={16} />
              <span>
                <strong>3</strong> {t('parrains', 'إحالات')} → <strong>+20</strong> {t('jours', 'أيام')}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Sparkles className="text-indigo-600 shrink-0" size={16} />
              <span>
                <strong>5</strong> {t('parrains', 'إحالات')} → <strong>+50</strong> {t('jours + fonctions bonus', 'أيام + ميزات إضافية')}
              </span>
            </li>
          </ul>

          <div className="rounded-xl border border-emerald-100 bg-white/90 px-3 py-3">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-800">
              <span>
                {maxed
                  ? t('Palier max atteint', 'أقصى مرحلة')
                  : t(`${label} complété vers le prochain palier`, `${label} مكتمل نحو المرحلة التالية`)}
              </span>
              <span className="tabular-nums text-emerald-700">
                {n} {t('actif(s)', 'مفعّل')}
                {days > 0 ? ` · +${days}j` : ''}
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-linear-to-r from-emerald-500 to-amber-400 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {bonus ? (
              <p className="mt-2 text-[11px] font-medium text-indigo-700 flex items-center gap-1">
                <Sparkles size={12} /> {t('Fonctions bonus débloquées', 'تم فتح الميزات الإضافية')}
              </p>
            ) : null}
            <p className="mt-2 text-[11px] text-slate-700">
              {t(
                `Commission ${commissionPercent}% · solde ${formatMadAmountLabel(available, 'fr')} (cumul ${formatMadAmountLabel(lifetime, 'fr')})`,
                `عمولة ${commissionPercent}% · الرصيد ${formatMadAmountLabel(available, 'ar')} (إجمالي ${formatMadAmountLabel(lifetime, 'ar')})`,
              )}
            </p>
            <a
              href="/dashboard/affiliate"
              className="mt-2 inline-block text-[11px] font-semibold text-emerald-800 hover:underline"
            >
              {t('Ouvrir le tableau affilié →', 'فتح لوحة الإحالة ←')}
            </a>
          </div>
        </div>

        <div className={`flex flex-col gap-2 shrink-0 ${compact ? 'w-full' : 'w-full lg:w-auto lg:min-w-[220px]'}`}>
          <button
            type="button"
            disabled={!link || loading}
            onClick={() => share('referral_card_whatsapp')}
            className={`inline-flex items-center justify-center gap-3 rounded-2xl bg-[#25D366] text-white font-bold shadow-md hover:bg-[#1ebe5a] disabled:opacity-50 ${
              compact ? 'py-3.5 px-4 text-sm' : 'py-4 px-6 text-base sm:text-lg'
            }`}
          >
            <MessageCircle size={compact ? 22 : 28} className="shrink-0" />
            {t('Partager sur WhatsApp', 'شارك على واتساب')}
          </button>
          <p className="text-[10px] text-center text-slate-500 leading-snug px-1">
            {t('Message en darija + français, prêt à envoyer.', 'رسالة بالدارجة + الفرنسية، جاهزة للإرسال.')}
          </p>
        </div>
      </div>
    </div>
  );
}

export { REFRESH_EVENT as ZAFIRIX_REFERRAL_REFRESH_EVENT };

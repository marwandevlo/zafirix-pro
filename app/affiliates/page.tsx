'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Gift,
  Globe,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  MousePointerClick,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import type { AtlasUiLocale } from '@/app/lib/atlas-format';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';

/* ── Types (mirror API response shapes) ──────────────────────────── */

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

/* ── Helpers ─────────────────────────────────────────────────────── */

const PLAN_LABEL: Record<string, { fr: string; ar: string }> = {
  starter: { fr: 'Starter', ar: 'Starter' },
  growth: { fr: 'Growth', ar: 'Growth' },
  pro: { fr: 'Pro', ar: 'Pro' },
  business: { fr: 'Business', ar: 'Business' },
  advanced: { fr: 'Advanced', ar: 'Advanced' },
  enterprise: { fr: 'Enterprise', ar: 'Enterprise' },
};

function statusBadge(status: string, t: (fr: string, ar: string) => string) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: t('Versé', 'مدفوع'), cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    credited: { label: t('Validé', 'مؤكد'), cls: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
    reversed: { label: t('Annulé', 'ملغى'), cls: 'bg-red-50 text-red-700 border-red-100' },
  };
  const s = map[status] ?? { label: t('En attente', 'معلق'), cls: 'bg-amber-50 text-amber-800 border-amber-100' };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

function MadVal({ value, locale }: { value: number; locale: AtlasUiLocale }) {
  return (
    <span className="notranslate tabular-nums" translate="no" lang={locale === 'ar' ? 'ar-MA' : 'fr-MA'}>
      {formatMadAmountLabel(value, locale)}
    </span>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function AffiliatePortalPage() {
  const [lang, setLang] = useState<AtlasUiLocale>('fr');
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);

  /* auth state */
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  /* login form */
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginMode, setLoginMode] = useState<'password' | 'magic'>('password');
  const [magicSent, setMagicSent] = useState(false);

  /* dashboard */
  const [dashLoading, setDashLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [copied, setCopied] = useState(false);

  /* ── Session bootstrap ──────────────────────────────────────── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: d }) => {
      setUserId(d.user?.id ?? null);
      setUserEmail(d.user?.email ?? null);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  /* ── Login handlers ─────────────────────────────────────────── */
  const handlePasswordLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setLoginError(
          error.message.includes('Invalid login')
            ? t('Email ou mot de passe incorrect.', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.')
            : error.message,
        );
      }
    } catch {
      setLoginError(t('Erreur réseau. Réessayez.', 'خطأ في الشبكة. حاول مجددًا.'));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleMagicLink = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/affiliates` : undefined;
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
      if (error) {
        setLoginError(error.message);
      } else {
        setMagicSent(true);
      }
    } catch {
      setLoginError(t('Erreur réseau. Réessayez.', 'خطأ في الشبكة. حاول مجددًا.'));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setData(null);
  };

  /* ── Dashboard fetch ────────────────────────────────────────── */
  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await fetch('/api/affiliate/dashboard', { credentials: 'include' });
      const json = (await res.json().catch(() => ({}))) as DashboardPayload;
      if (res.ok && json?.ok) setData(json);
      else setData(null);
    } catch {
      setData(null);
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) void loadDashboard();
  }, [userId, loadDashboard]);

  /* ── Derived values ─────────────────────────────────────────── */
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
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const shareWhatsApp = () => {
    if (!link) return;
    const text = [
      `جرّب ZAFIRIX PRO دابا باش تسهل المحاسبة، الفواتير والضرائب ديالك فالمغرب — 7 أيام مجانية، بلا كارت بانكير.`,
      ``,
      `Essaie ZAFIRIX PRO : compta, factures et fiscalité au Maroc — 7 jours gratuits, sans carte bancaire.`,
      ``,
      `Lien · الرابط : ${link}`,
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  /* ── Splash / loading ───────────────────────────────────────── */
  if (!authReady) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0F1F3D]">
        <Loader2 className="animate-spin text-cyan-400" size={32} />
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════ *
   * LOGIN VIEW
   * ══════════════════════════════════════════════════════════════ */
  if (!userId) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center px-4 py-12"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        style={{
          background:
            'radial-gradient(circle at 20% 10%, rgba(6,182,212,0.25), transparent 50%), radial-gradient(circle at 80% 80%, rgba(14,116,144,0.3), transparent 50%), #0F1F3D',
        }}
      >
        {/* language toggle */}
        <div className="fixed top-4 right-4 inline-flex rounded-xl border border-white/15 bg-white/8 p-0.5 z-20">
          <button type="button" onClick={() => setLang('fr')} className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${lang === 'fr' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/60'}`}>FR</button>
          <button type="button" onClick={() => setLang('ar')} className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${lang === 'ar' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/60'}`}>AR</button>
        </div>

        <div className="w-full max-w-md space-y-6">
          {/* brand */}
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/90">Zafirixpro</p>
            <h1 className="mt-2 text-3xl font-bold text-white flex items-center justify-center gap-2">
              <Gift className="text-[#06b6d4] shrink-0" size={28} />
              {t('Portail Affilié', 'بوابة الإحالة')}
            </h1>
            <p className="mt-2 text-sm text-white/60 max-w-sm mx-auto">
              {t(
                'Connectez-vous pour accéder à votre tableau de bord affilié, suivre vos commissions et gérer vos liens de parrainage.',
                'سجّل الدخول للوصول إلى لوحة تحكم الإحالة، تتبّع عمولاتك وإدارة روابط الإحالة.',
              )}
            </p>
          </div>

          {/* login card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl p-6 sm:p-8 space-y-5">
            {/* mode tabs */}
            <div className="flex rounded-2xl border border-white/10 bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => { setLoginMode('password'); setMagicSent(false); setLoginError(''); }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${loginMode === 'password' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/50 hover:text-white/80'}`}
              >
                {t('Mot de passe', 'كلمة المرور')}
              </button>
              <button
                type="button"
                onClick={() => { setLoginMode('magic'); setLoginError(''); }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${loginMode === 'magic' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/50 hover:text-white/80'}`}
              >
                {t('Lien magique', 'رابط سحري')}
              </button>
            </div>

            {/* email */}
            <div>
              <label className="block text-[11px] font-semibold text-white/60 uppercase tracking-wide mb-1.5">
                {t('Adresse email', 'البريد الإلكتروني')}
              </label>
              <div className="relative">
                <Mail size={16} className="absolute top-1/2 -translate-y-1/2 left-3 text-white/30 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="affiliate@example.com"
                  className="w-full rounded-2xl border border-white/15 bg-white/5 pl-9 pr-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#06b6d4] focus:ring-1 focus:ring-[#06b6d4]"
                />
              </div>
            </div>

            {/* password field (only in password mode) */}
            {loginMode === 'password' && (
              <div>
                <label className="block text-[11px] font-semibold text-white/60 uppercase tracking-wide mb-1.5">
                  {t('Mot de passe', 'كلمة المرور')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#06b6d4] focus:ring-1 focus:ring-[#06b6d4]"
                  onKeyDown={(e) => { if (e.key === 'Enter') void handlePasswordLogin(); }}
                />
              </div>
            )}

            {/* error */}
            {loginError && (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">{loginError}</p>
            )}

            {/* magic link sent */}
            {loginMode === 'magic' && magicSent && (
              <p className="text-xs text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-xl px-3 py-2">
                {t(
                  'Un lien de connexion a été envoyé à votre adresse email. Vérifiez votre boîte de réception.',
                  'تم إرسال رابط تسجيل الدخول إلى بريدك الإلكتروني. تحقق من صندوق الوارد.',
                )}
              </p>
            )}

            {/* submit */}
            <button
              type="button"
              disabled={loginLoading || !email.trim() || (loginMode === 'password' && !password)}
              onClick={() => {
                if (loginMode === 'password') void handlePasswordLogin();
                else void handleMagicLink();
              }}
              className="w-full inline-flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-[#06b6d4] text-[#0F1F3D] font-bold text-sm hover:bg-cyan-300 disabled:opacity-50 transition"
            >
              {loginLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              {loginMode === 'password'
                ? t('Se connecter', 'تسجيل الدخول')
                : t('Envoyer le lien', 'إرسال الرابط')}
            </button>
          </div>

          {/* info */}
          <div className="text-center space-y-2">
            <p className="text-[11px] text-white/40">
              {t(
                'Utilisez le même compte email que celui avec lequel vous vous êtes inscrit sur ZafirixPro.',
                'استخدم نفس البريد الإلكتروني الذي سجّلت به في ZafirixPro.',
              )}
            </p>
            <p className="text-xs text-white/25">
              {t('Commission jusqu'à', 'عمولة تصل إلى')} <strong className="text-[#06b6d4]">40%</strong> {t('par paiement', 'لكل دفعة')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════ *
   * DASHBOARD VIEW
   * ══════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-dvh bg-[#0F1F3D]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div
        className="px-4 sm:px-6 lg:px-8 pt-6 pb-12"
        style={{
          background:
            'radial-gradient(circle at 12% 0%, rgba(6,182,212,0.28), transparent 42%), radial-gradient(circle at 90% 20%, rgba(14,116,144,0.35), transparent 40%), #0F1F3D',
        }}
      >
        <div className="max-w-5xl mx-auto space-y-6">
          {/* ── Header ────────────────────────────────────────── */}
          <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/90">Zafirixpro</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
                <Gift className="text-[#06b6d4] shrink-0" size={26} />
                {t('Portail Affilié', 'بوابة الإحالة')}
              </h1>
              <p className="mt-1.5 text-sm text-white/65 max-w-xl">
                {t(
                  'Partagez votre lien, suivez les clics et gagnez jusqu'à 40 % sur chaque abonnement payé.',
                  'شارك رابطك، تابع النقرات واربح حتى 40٪ على كل اشتراك مدفوع.',
                )}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* lang toggle */}
              <div className="inline-flex rounded-xl border border-white/15 bg-white/8 p-0.5">
                <button type="button" onClick={() => setLang('fr')} className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${lang === 'fr' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/60'}`}>FR</button>
                <button type="button" onClick={() => setLang('ar')} className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${lang === 'ar' ? 'bg-[#06b6d4] text-[#0F1F3D]' : 'text-white/60'}`}>AR</button>
              </div>

              {/* current tier */}
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right">
                <p className="text-[10px] uppercase tracking-wide text-white/50">{t('Votre palier', 'مستواك')}</p>
                <p className="text-2xl font-extrabold text-[#06b6d4] tabular-nums">{currentPercent}%</p>
                <p className="text-xs text-white/70">{currentTier ? t(currentTier.labelFr, currentTier.labelAr) : '—'}</p>
              </div>

              {/* user pill + logout */}
              <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-3 py-2">
                <span className="text-xs text-white/60 truncate max-w-[160px]">{userEmail}</span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-1 text-[11px] text-red-300 hover:text-red-200 font-semibold"
                  title={t('Déconnexion', 'تسجيل الخروج')}
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          </header>

          {/* ── Loading spinner ────────────────────────────────── */}
          {dashLoading && !data && (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-cyan-400" size={28} />
            </div>
          )}

          {/* ── No data fallback ──────────────────────────────── */}
          {!dashLoading && !data && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center space-y-3">
              <p className="text-sm text-white/70">
                {t(
                  'Impossible de charger votre tableau de bord affilié. Vérifiez que votre compte dispose d'un code de parrainage.',
                  'تعذّر تحميل لوحة تحكم الإحالة. تحقق من أن حسابك يتوفر على رمز إحالة.',
                )}
              </p>
              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#06b6d4] text-[#0F1F3D] font-bold text-sm hover:bg-cyan-300"
              >
                {t('Réessayer', 'إعادة المحاولة')}
              </button>
            </div>
          )}

          {/* ── Dashboard content ─────────────────────────────── */}
          {data && (
            <>
              {/* referral link section */}
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
                    <p className="text-[10px] uppercase tracking-wide text-cyan-300/80 mb-1">{t('Lien public', 'الرابط العام')}</p>
                    <p className="text-sm sm:text-base font-mono text-white break-all notranslate" translate="no">
                      {link || '—'}
                    </p>
                    {code && (
                      <p className="mt-1 text-[11px] text-white/50">
                        {t('Code', 'الرمز')} · <span className="font-semibold text-cyan-200 notranslate" translate="no">{code}</span>
                      </p>
                    )}
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

              {/* stats cards */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {([
                  { label: t('Clics totaux', 'إجمالي النقرات'), value: String(clicks), icon: MousePointerClick, money: false },
                  { label: t('Filleuls actifs', 'إحالات نشطة'), value: String(active), icon: Users, money: false },
                  { label: t('Gains en attente', 'أرباح معلّقة'), value: pending, icon: Wallet, money: true },
                  { label: t('Montants versés', 'المبالغ المدفوعة'), value: paid, icon: Trophy, money: true },
                ] as const).map((card) => (
                  <div key={card.label} className="rounded-2xl border border-white/10 bg-white/8 backdrop-blur px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-white/60 font-medium">{card.label}</p>
                      <card.icon size={15} className="text-[#06b6d4]" />
                    </div>
                    <p className="mt-2 text-xl sm:text-2xl font-bold text-white tabular-nums">
                      {card.money ? <MadVal value={Number(card.value)} locale={lang} /> : card.value}
                    </p>
                  </div>
                ))}
              </section>

              {/* lifetime line */}
              <p className="text-xs text-white/50">
                {t('Cumul lifetime', 'الإجمالي التراكمي')} · <MadVal value={lifetime} locale={lang} />
                {nextTier
                  ? ` · ${t(`Encore ${toNext} activation(s) pour ${nextTier.percent} %`, `تبقّى ${toNext} تفعيل للوصول إلى ${nextTier.percent}٪`)}`
                  : ` · ${t('Palier maximum atteint', 'بلغتَ أعلى مستوى')}`}
              </p>

              {/* commission tiers */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={16} className="text-[#06b6d4]" />
                  <h2 className="text-sm font-bold text-white">{t('Paliers de commission', 'مستويات العمولة')}</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {tiers.map((tier) => {
                    const isActive = currentTier?.id === tier.id;
                    return (
                      <div
                        key={tier.id}
                        className={`rounded-2xl border px-4 py-4 ${
                          isActive
                            ? 'border-[#06b6d4] bg-[#06b6d4] text-[#0F1F3D] shadow-lg shadow-cyan-500/20'
                            : 'border-white/10 bg-white/6 text-white'
                        }`}
                      >
                        <p className={`text-[11px] font-semibold uppercase tracking-wide ${isActive ? 'text-[#0F1F3D]/70' : 'text-white/50'}`}>
                          {t(tier.labelFr, tier.labelAr)}
                        </p>
                        <p className="mt-1 text-3xl font-extrabold tabular-nums">{tier.percent}%</p>
                        <p className={`mt-1 text-[11px] leading-snug ${isActive ? 'text-[#0F1F3D]/75' : 'text-white/55'}`}>
                          {t(tier.hintFr, tier.hintAr)}
                        </p>
                        {isActive && (
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide">{t('Palier actuel', 'المستوى الحالي')}</p>
                        )}
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

              {/* plan rates */}
              {data.planRates && data.planRates.length > 0 && (
                <section className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                  <h3 className="text-xs font-bold text-white mb-3">{t('Taux selon le forfait du filleul', 'النسبة حسب خطة المُحال')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.planRates.map((row) => (
                      <span key={row.planId} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs text-white">
                        {PLAN_LABEL[row.planId]?.[lang] ?? row.planId}
                        <strong className="text-[#06b6d4]">{row.percent}%</strong>
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* transactions table */}
              <section className="rounded-3xl border border-white/10 bg-white overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#0F1F3D]">{t('Historique des commissions', 'سجل العمولات')}</h2>
                  <button type="button" onClick={() => void loadDashboard()} className="text-xs font-semibold text-cyan-700 hover:underline">
                    {t('Actualiser', 'تحديث')}
                  </button>
                </div>
                {transactions.length === 0 ? (
                  <p className="px-5 py-10 text-sm text-slate-400 text-center">
                    {t(
                      'Aucune commission pour le moment. Partagez votre lien — le premier paiement d'un filleul apparaîtra ici.',
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
                              {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-MA') : '—'}
                            </td>
                            <td className="px-4 py-3 capitalize text-slate-700">{tx.source || '—'}</td>
                            <td className="px-4 py-3 font-semibold text-[#0F1F3D]">{tx.commissionPercent}%</td>
                            <td className="px-4 py-3 text-right"><MadVal value={tx.paymentAmount} locale={lang} /></td>
                            <td className="px-4 py-3 text-right font-semibold text-cyan-700"><MadVal value={tx.commissionAmount} locale={lang} /></td>
                            <td className="px-4 py-3">{statusBadge(tx.status, t)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

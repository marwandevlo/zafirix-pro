'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Calculator,
  TrendingUp,
  Upload,
  Bell,
  ChevronRight,
  ChevronDown,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Users,
  Zap,
  Shield,
  Menu,
  Package,
  Truck,
  Wallet,
  Gavel,
  Briefcase,
  UserRound,
  Plus,
  Sparkles,
} from 'lucide-react';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import type { AtlasInvoice } from '@/app/types/atlas-invoice';
import { isOverdue, todayYmd } from '@/app/lib/atlas-dates';
import { refreshAtlasUsageState } from '@/app/lib/atlas-usage-limits';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { GlobalSearchButton } from '@/app/components/search/GlobalSearchButton';
import { TrialUpgradeBanner } from '@/app/components/trial/TrialUpgradeBanner';
import { TrialOnboardingChecklist } from '@/app/components/trial/TrialOnboardingChecklist';
import { GettingStartedWidget } from '@/app/components/onboarding/GettingStartedWidget';
import { DemoModeBanner } from '@/app/components/onboarding/DemoModeBanner';
import { OnboardingChecklistWidget } from '@/app/components/onboarding/OnboardingChecklistWidget';
import { SmartRecommendationsWidget } from '@/app/components/onboarding/SmartRecommendationsWidget';
import { GuidedTourEngine } from '@/app/components/onboarding/GuidedTourEngine';
import { FeedbackWidget } from '@/app/components/onboarding/FeedbackWidget';
import { DashboardFunnelInsights } from '@/app/components/conversion/DashboardFunnelInsights';
import { AppSidebar, AppSidebarMobileOverlay } from '@/app/components/shell/AppSidebar';
import { MobileBottomNav } from '@/app/components/shell/MobileBottomNav';
import { ReferralDashboardCard } from '@/app/components/referral/ReferralDashboardCard';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';
import { LegalContractsWidget } from '@/app/components/dashboard/LegalContractsWidget';
import { AuditStatsWidget } from '@/app/components/dashboard/AuditStatsWidget';
import { AlertCenterWidget } from '@/app/components/dashboard/AlertCenterWidget';
import { ReconciliationWidget } from '@/app/components/bank/ReconciliationWidget';
import { BankAlertCenter } from '@/app/components/bank/BankAlertCenter';
import { PayrollDashboardSection } from '@/app/components/payroll/PayrollDashboardSection';
import { LiasseReadinessWidget } from '@/app/components/liasse/LiasseReadinessWidget';
import { AIInsightsWidget } from '@/app/components/assistant/AIInsightsWidget';
import { FiscalClosingAssistantWidget } from '@/app/components/assistant/FiscalClosingAssistantWidget';
import { ExecutiveSummaryWidget } from '@/app/components/assistant/ExecutiveSummaryWidget';
import { CompanySwitcher } from '@/app/components/shell/CompanySwitcher';
import { CompanyMasterExportMenu } from '@/app/components/company/CompanyMasterExportMenu';
import { ConsolidatedDashboardWidget } from '@/app/components/cabinet/ConsolidatedDashboardWidget';
import { UsagePlanWidget } from '@/app/components/billing/UsagePlanWidget';
import { DeadlineRadarWidget } from '@/app/components/dashboard/DeadlineRadarWidget';
import { LegalCalendarWidget } from '@/app/components/dashboard/LegalCalendarWidget';
import { NotificationCenterWidget } from '@/app/components/dashboard/NotificationCenterWidget';
import { AuditorPassWidget } from '@/app/components/dashboard/AuditorPassWidget';
import { MoroccoComplianceAuditWidget } from '@/app/components/dashboard/MoroccoComplianceAuditWidget';
import { fetchDashboardDeadlinesShared } from '@/app/lib/dashboard-deadlines-client';

const ReferralPostOnboardingModal = dynamic(
  () =>
    import('@/app/components/referral/ReferralPostOnboardingModal').then((m) => ({
      default: m.ReferralPostOnboardingModal,
    })),
  { ssr: false },
);

const DashboardIaSection = dynamic(
  () =>
    import('@/app/components/dashboard/DashboardIaSection').then((m) => ({
      default: m.DashboardIaSection,
    })),
  {
    ssr: false,
    loading: () => <div className="dash-glass h-36 animate-pulse rounded-2xl" />,
  },
);

type ModuleItem = {
  id: string;
  label: string;
  labelAr: string;
  icon: typeof FileText;
  href: string;
  urgent?: boolean;
};

type ModuleGroup = {
  id: string;
  titleFr: string;
  titleAr: string;
  items: ModuleItem[];
};

const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: 'invoicing',
    titleFr: 'Facturation & Comptabilité',
    titleAr: 'الفوترة والمحاسبة',
    items: [
      { id: 'factures', label: 'Factures', labelAr: 'الفواتير', icon: FileText, href: '/factures' },
      { id: 'comptabilite', label: 'Comptabilité', labelAr: 'المحاسبة', icon: LayoutDashboard, href: '/comptabilite' },
      { id: 'clients', label: 'Clients', labelAr: 'العملاء', icon: Users, href: '/clients' },
      { id: 'caisse', label: 'Caisse', labelAr: 'الصندوق', icon: Wallet, href: '/caisse' },
      { id: 'documents', label: 'Documents IA', labelAr: 'وثائق ذكية', icon: Upload, href: '/documents' },
      { id: 'recouvrement', label: 'Recouvrement', labelAr: 'التحصيل', icon: Gavel, href: '/recouvrement' },
    ],
  },
  {
    id: 'logistics',
    titleFr: 'Logistique & COD',
    titleAr: 'اللوجستيك والتحصيل',
    items: [
      { id: 'logistique', label: 'Logistique', labelAr: 'اللوجستيك', icon: Truck, href: '/logistique' },
      { id: 'inventaire', label: 'Inventaire', labelAr: 'المخزون', icon: Package, href: '/inventaire' },
    ],
  },
  {
    id: 'business',
    titleFr: 'Gestion métier',
    titleAr: 'إدارة الأعمال',
    items: [
      { id: 'auto-entrepreneur', label: 'Auto-entrepreneur', labelAr: 'المقاول الذاتي', icon: Briefcase, href: '/auto-entrepreneur' },
      { id: 'personne-physique', label: 'Personne physique', labelAr: 'شخص ذاتي', icon: UserRound, href: '/personne-physique' },
      { id: 'tva', label: 'TVA', labelAr: 'TVA', icon: Receipt, href: '/tva', urgent: true },
      { id: 'is', label: 'IS Fiscal', labelAr: 'IS', icon: Calculator, href: '/is' },
      { id: 'ir', label: 'IR / Salaires', labelAr: 'IR', icon: TrendingUp, href: '/ir' },
      { id: 'consultant', label: 'Consultant IA', labelAr: 'المستشار', icon: Brain, href: '/consultant' },
    ],
  },
];

const QUICK_ACTIONS = [
  { id: 'invoice', labelFr: 'Nouvelle facture', labelAr: 'فاتورة جديدة', href: '/factures', icon: FileText },
  { id: 'shipment', labelFr: 'Nouvelle expédition', labelAr: 'شحنة جديدة', href: '/logistique', icon: Truck },
  { id: 'expense', labelFr: 'Ajouter une dépense', labelAr: 'إضافة مصروف', href: '/comptabilite', icon: Wallet },
  { id: 'audit', labelFr: 'Audit fiscal Maroc', labelAr: 'تدقيق ضريبي', href: '#morocco-audit', icon: Sparkles },
] as const;

function statusLabel(status: AtlasInvoice['status'], t: (fr: string, ar: string) => string): string {
  if (status === 'paid') return t('Payée', 'مدفوعة');
  if (status === 'sent') return t('Envoyée', 'مرسلة');
  if (status === 'draft') return t('Brouillon', 'مسودة');
  return String(status);
}

export default function Home() {
  const router = useRouter();
  const [lang, setLang] = useState<'fr' | 'ar'>('fr');
  const [menuOpen, setMenuOpen] = useState(false);
  const [connected, setConnected] = useState(true);
  const [invoices, setInvoices] = useState<AtlasInvoice[]>([]);
  const [fiscalUrgentCount, setFiscalUrgentCount] = useState(0);
  const [deadlinesError, setDeadlinesError] = useState(false);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const t = (fr: string, ar: string) => (lang === 'fr' ? fr : ar);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDashboardDeadlinesShared();
        if (cancelled) return;
        if (!data?.counts) {
          setDeadlinesError(true);
          return;
        }
        setDeadlinesError(false);
        setFiscalUrgentCount((data.counts.red ?? 0) + (data.counts.orange ?? 0));
      } catch {
        if (!cancelled) setDeadlinesError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isAtlasSupabaseDataEnabled()) {
          await refreshAtlasUsageState();
        }
        const inv = await listAtlasInvoices();
        if (!cancelled) setInvoices(inv);
      } catch {
        if (!cancelled) setInvoices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingFiscalCount = fiscalUrgentCount;

  const invoiceSummary = useMemo(() => {
    const now = todayYmd();
    const totalFacture = invoices.reduce((sum, inv) => sum + (inv.totalTTC || 0), 0);
    const unpaid = invoices.filter((inv) => inv.status !== 'paid');
    const overdue = unpaid.filter((inv) => isOverdue(inv.dueDate, false, now));
    const paid = invoices.filter((inv) => inv.status === 'paid');
    const paidAmount = paid.reduce((sum, inv) => sum + (inv.totalTTC || 0), 0);
    return {
      totalFacture,
      unpaidCount: unpaid.length,
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, inv) => sum + (inv.totalTTC || 0), 0),
      paidAmount,
      pendingAmount: unpaid.reduce((sum, inv) => sum + (inv.totalTTC || 0), 0),
    };
  }, [invoices]);

  const recentInvoices = useMemo(() => {
    return [...invoices]
      .sort((a, b) => String(b.issueDate ?? '').localeCompare(String(a.issueDate ?? '')))
      .slice(0, 8);
  }, [invoices]);

  const kpis = useMemo(
    () => [
      {
        label: "Chiffre d'affaires",
        labelAr: 'رقم الأعمال',
        value: formatMadAmountLabel(invoiceSummary.totalFacture),
        change: t('Factures enregistrées', 'فواتير مسجلة'),
        up: true,
        icon: TrendingUp,
      },
      {
        label: 'Encaissé',
        labelAr: 'المحصّل',
        value: formatMadAmountLabel(invoiceSummary.paidAmount),
        change: t('Factures payées', 'فواتير مدفوعة'),
        up: true,
        icon: Wallet,
      },
      {
        label: 'À encaisser',
        labelAr: 'المستحقات',
        value: formatMadAmountLabel(invoiceSummary.pendingAmount),
        change: `${invoiceSummary.overdueCount} ${t('en retard', 'متأخرة')}`,
        up: invoiceSummary.overdueCount === 0,
        icon: FileText,
      },
      {
        label: 'Rappels fiscaux',
        labelAr: 'تذكير ضريبي',
        value: deadlinesError ? '!' : String(pendingFiscalCount),
        change: deadlinesError
          ? t('Échéances indisponibles', 'المواعيد غير متاحة')
          : t('Radar échéances', 'رادار المواعيد'),
        up: !deadlinesError && pendingFiscalCount === 0,
        icon: Calendar,
      },
    ],
    [invoiceSummary, pendingFiscalCount, deadlinesError, lang],
  );

  const navigate = (href: string) => {
    setMenuOpen(false);
    if (href.startsWith('#')) {
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    router.push(href);
  };

  const dateLabel = new Date().toLocaleDateString(lang === 'fr' ? 'fr-MA' : 'ar-MA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex h-dvh bg-[#f4f6fa] overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <AppSidebarMobileOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
      <AppSidebar
        variant="home"
        lang={lang}
        setLang={setLang}
        t={t}
        connected={connected}
        setConnected={setConnected}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header
          className="bg-white/80 backdrop-blur-xl border-b border-[#0F1F3D]/10 px-3 sm:px-4 lg:px-8 py-3 lg:py-3.5 flex items-center justify-between shrink-0 z-20"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="lg:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-slate-100"
              aria-label={t('Menu', 'القائمة')}
            >
              <Menu size={22} className="text-[#0F1F3D]" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-[#0F1F3D] truncate">
                {t('Tableau de bord', 'لوحة التحكم')}
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block capitalize">{dateLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <CompanySwitcher className="hidden md:block" />
            <CompanyMasterExportMenu />
            <GlobalSearchButton />
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="relative min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-slate-100"
              aria-label={t('Notifications', 'الإشعارات')}
            >
              <Bell size={18} className="text-slate-500" />
              {notificationUnread > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[0.5rem] h-2 bg-rose-500 rounded-full" />
              )}
            </button>
            <div className="flex items-center gap-2 pl-1">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <div className="w-9 h-9 rounded-full bg-[#0F1F3D] flex items-center justify-center text-cyan-300 text-sm font-bold">
                Z
              </div>
            </div>
          </div>
        </header>

        <div
          className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 lg:px-8 py-4 lg:py-6 space-y-5 lg:space-y-6 pb-mobile-nav"
          data-tour="dashboard"
        >
          {/* ── 1. Welcome / status ─────────────────────────────────────── */}
          <section
            className="relative overflow-hidden rounded-2xl border border-white/10 text-white shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #0F1F3D 0%, #163057 55%, #0e7490 130%)',
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 12% 20%, rgba(34,211,238,0.28), transparent 40%), radial-gradient(circle at 90% 80%, rgba(14,116,144,0.35), transparent 45%)',
              }}
            />
            <div className="relative p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-cyan-300/90">
                  Zafirixpro
                </p>
                <h2 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight">
                  {t('Bienvenue sur votre cockpit', 'مرحباً بك في لوحة القيادة')}
                </h2>
                <p className="mt-1.5 text-sm text-white/65 max-w-xl">
                  {t(
                    'Suivez quotas, trésorerie et actions prioritaires — conçus pour mobile et desktop.',
                    'تابع الحصص والخزينة والإجراءات ذات الأولوية — للجوال وسطح المكتب.',
                  )}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full lg:w-auto">
                <div className="sm:min-w-[200px] rounded-xl bg-white/10 backdrop-blur border border-white/15 p-2">
                  <CompanySwitcher className="w-full" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 sm:flex-none rounded-xl bg-white/10 backdrop-blur border border-white/15 px-3 py-2.5 min-h-11">
                    <p className="text-[10px] text-white/50 uppercase tracking-wide">
                      {t('Statut', 'الحالة')}
                    </p>
                    <p className="text-sm font-semibold text-cyan-200">
                      {connected ? t('Connecté', 'متصل') : t('Hors ligne', 'غير متصل')}
                    </p>
                  </div>
                  <div className="flex-1 sm:flex-none rounded-xl bg-white/10 backdrop-blur border border-white/15 px-3 py-2.5 min-h-11">
                    <p className="text-[10px] text-white/50 uppercase tracking-wide">
                      {t('Alertes', 'تنبيهات')}
                    </p>
                    <p className="text-sm font-semibold">
                      {invoiceSummary.overdueCount + pendingFiscalCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <ReferralPostOnboardingModal lang={lang} />
          <TrialUpgradeBanner />
          <DemoModeBanner lang={lang} />

          {invoiceSummary.overdueCount > 0 && (
            <div className="dash-glass rounded-2xl border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-900">
              <span className="font-semibold">{t('Paiements en retard', 'مدفوعات متأخرة')} — </span>
              {invoiceSummary.overdueCount} {t('facture(s)', 'فاتورة')} ·{' '}
              {formatMadAmountLabel(invoiceSummary.overdueAmount)}
            </div>
          )}

          {/* ── 2. Usage & KPIs ─────────────────────────────────────────── */}
          <section className="grid grid-cols-1 xl:grid-cols-5 gap-4 lg:gap-5">
            <div className="xl:col-span-2">
              <UsagePlanWidget />
            </div>
            <div className="xl:col-span-3 grid grid-cols-2 gap-3 sm:gap-4">
              {kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="dash-glass rounded-2xl p-4 sm:p-5 flex flex-col justify-between min-h-[7.5rem]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium leading-tight">
                      {t(kpi.label, kpi.labelAr)}
                    </p>
                    <div className="w-8 h-8 rounded-lg bg-[#0F1F3D]/5 text-[#0F1F3D] flex items-center justify-center shrink-0">
                      <kpi.icon size={15} />
                    </div>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-[#0F1F3D] mt-2 tabular-nums truncate">
                    {kpi.value}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {kpi.up ? (
                      <ArrowUpRight size={12} className="text-emerald-500" />
                    ) : (
                      <ArrowDownRight size={12} className="text-rose-500" />
                    )}
                    <span className={`text-[11px] ${kpi.up ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {kpi.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 3. Quick actions ────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#0F1F3D]">
                {t('Actions rapides', 'إجراءات سريعة')}
              </h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => navigate(action.href)}
                  className="dash-glass group rounded-2xl p-3.5 sm:p-4 min-h-[4.75rem] text-left hover:border-cyan-300/60 hover:shadow-md active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0F1F3D] text-cyan-300 flex items-center justify-center shrink-0 group-hover:bg-[#163057]">
                      <action.icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#0F1F3D] leading-snug">
                        {t(action.labelFr, action.labelAr)}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Plus size={10} /> {t('Ouvrir', 'فتح')}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ── Audit & Conformité Maroc ──────────────────────────────── */}
          <div id="morocco-audit">
            <MoroccoComplianceAuditWidget lang={lang} />
          </div>

          {/* ── 4. Recent activity ──────────────────────────────────────── */}
          <section className="dash-glass rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100/80 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#0F1F3D]">
                  {t('Activité récente', 'النشاط الأخير')}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {t('Dernières factures', 'آخر الفواتير')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/factures')}
                className="text-xs font-semibold text-cyan-700 hover:underline min-h-10 px-2"
              >
                {t('Tout voir', 'عرض الكل')} →
              </button>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-slate-100">
              {recentInvoices.length === 0 ? (
                <p className="p-5 text-sm text-slate-400">{t('Aucune facture pour le moment.', 'لا توجد فواتير بعد.')}</p>
              ) : (
                recentInvoices.map((inv) => (
                  <button
                    key={String(inv.id)}
                    type="button"
                    onClick={() => navigate('/factures')}
                    className="w-full text-left p-4 hover:bg-slate-50/80 active:bg-slate-50 min-h-16"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0F1F3D] truncate">
                          {inv.clientName || t('Client', 'عميل')}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {inv.number} · {inv.issueDate}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[#0F1F3D] tabular-nums">
                          {formatMadAmountLabel(inv.totalTTC || 0)}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{statusLabel(inv.status, t)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 text-slate-500 text-left text-xs">
                  <tr>
                    <th className="px-5 py-3 font-semibold">{t('N°', 'الرقم')}</th>
                    <th className="px-5 py-3 font-semibold">{t('Client', 'العميل')}</th>
                    <th className="px-5 py-3 font-semibold">{t('Date', 'التاريخ')}</th>
                    <th className="px-5 py-3 font-semibold">{t('Statut', 'الحالة')}</th>
                    <th className="px-5 py-3 font-semibold text-right">{t('Montant', 'المبلغ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-slate-400 text-center">
                        {t('Aucune facture pour le moment.', 'لا توجد فواتير بعد.')}
                      </td>
                    </tr>
                  ) : (
                    recentInvoices.map((inv) => (
                      <tr
                        key={String(inv.id)}
                        className="border-t border-slate-100 hover:bg-slate-50/70 cursor-pointer"
                        onClick={() => navigate('/factures')}
                      >
                        <td className="px-5 py-3 font-medium text-[#0F1F3D]">{inv.number}</td>
                        <td className="px-5 py-3 text-slate-700">{inv.clientName}</td>
                        <td className="px-5 py-3 text-slate-500">{inv.issueDate}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {statusLabel(inv.status, t)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#0F1F3D]">
                          {formatMadAmountLabel(inv.totalTTC || 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Module groups ───────────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0F1F3D]">
                {t('Modules', 'الوحدات')}
              </h2>
              <span className="text-[11px] text-slate-400">
                {MODULE_GROUPS.reduce((n, g) => n + g.items.length, 0)} {t('raccourcis', 'اختصارات')}
              </span>
            </div>
            {MODULE_GROUPS.map((group) => (
              <div key={group.id} className="dash-glass rounded-2xl p-4 sm:p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-800/70 mb-3">
                  {t(group.titleFr, group.titleAr)}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
                  {group.items.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => navigate(m.href)}
                      className="relative rounded-xl border border-slate-100 bg-white/70 p-3 min-h-[4.25rem] text-left hover:border-cyan-200 hover:shadow-sm active:scale-[0.99] transition-all"
                    >
                      {m.urgent ? (
                        <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse" />
                      ) : null}
                      <div className="w-8 h-8 rounded-lg bg-[#0F1F3D] text-cyan-300 flex items-center justify-center mb-2">
                        <m.icon size={15} />
                      </div>
                      <p className="text-xs font-semibold text-[#0F1F3D] leading-snug line-clamp-2">
                        {t(m.label, m.labelAr)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* Deadlines strip */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
            <DeadlineRadarWidget lang={lang} />
            <LegalCalendarWidget lang={lang} />
          </section>

          {/* Onboarding / growth (secondary) */}
          <div className="space-y-4">
            <GettingStartedWidget lang={lang} />
            <OnboardingChecklistWidget lang={lang} />
            <SmartRecommendationsWidget lang={lang} />
            <ReferralDashboardCard lang={lang} />
            <TrialOnboardingChecklist lang={lang} />
            <DashboardFunnelInsights lang={lang} pendingDeclarationsCount={pendingFiscalCount} />
          </div>

          {/* Collapsible deeper insights */}
          <section className="dash-glass rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 min-h-14 text-left hover:bg-slate-50/50"
            >
              <div>
                <p className="text-sm font-semibold text-[#0F1F3D]">
                  {t('Insights & outils avancés', 'رؤى وأدوات متقدمة')}
                </p>
                <p className="text-[11px] text-slate-400">
                  {t('Notifications, banque, IA, audit…', 'إشعارات، بنك، ذكاء، تدقيق…')}
                </p>
              </div>
              <ChevronDown
                size={18}
                className={`text-slate-400 shrink-0 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {moreOpen ? (
              <div className="border-t border-slate-100 p-4 sm:p-5 space-y-4 lg:space-y-5">
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-xs text-amber-950 flex gap-2 items-start">
                  <Shield size={14} className="shrink-0 mt-0.5 text-amber-700" aria-hidden />
                  <p>
                    {t(
                      'Les échéances fiscales sont indicatives — validez avec votre expert-comptable.',
                      'المواعيد الضريبية إشارية — يُرجى التحقق مع خبيركم المحاسبي.',
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <NotificationCenterWidget onUnreadChange={setNotificationUnread} />
                    </div>
                    <AuditorPassWidget />
                  </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <AlertCenterWidget />
                  </div>
                  <LegalContractsWidget />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <LiasseReadinessWidget />
                  <ReconciliationWidget />
                  <BankAlertCenter compact />
                </div>
                <PayrollDashboardSection />
                <ConsolidatedDashboardWidget />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <AIInsightsWidget />
                  <FiscalClosingAssistantWidget />
                  <ExecutiveSummaryWidget />
                </div>
                <DashboardIaSection />
                <AuditStatsWidget />
              </div>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-2 pb-2">
            <button
              type="button"
              onClick={() => window.open('https://www.tax.gov.ma', '_blank')}
              className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Shield size={14} className="text-cyan-600" /> DGI · SIMPL
            </button>
            <button
              type="button"
              onClick={() => window.open('https://www.cnss.ma', '_blank')}
              className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Users size={14} className="text-emerald-600" /> CNSS
            </button>
            <button
              type="button"
              onClick={() => navigate('/consultant')}
              className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Zap size={14} className="text-indigo-500" /> {t('Conseil IA', 'مستشار')}
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </main>

      <MobileBottomNav onOpenMenu={() => setMenuOpen(true)} />
      <GuidedTourEngine lang={lang} autoStart />
      <FeedbackWidget lang={lang} />
    </div>
  );
}

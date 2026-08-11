'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, FileText, Receipt, Calculator,
  TrendingUp, Upload, Bell, ChevronRight,
  AlertCircle, Brain,
  ArrowUpRight, ArrowDownRight, Calendar, Globe,
  Users, Zap, Shield, Menu, Package, Truck, Wallet, Gavel, Briefcase, UserRound,
} from 'lucide-react';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import type { AtlasInvoice } from '@/app/types/atlas-invoice';
import { isOverdue, todayYmd } from '@/app/lib/atlas-dates';
import { refreshAtlasUsageState } from '@/app/lib/atlas-usage-limits';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { GlobalSearchButton } from '@/app/components/search/GlobalSearchButton';
import { UsageWidget } from '@/app/components/usage/UsageWidget';
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
import { SubscriptionWidget } from '@/app/components/billing/SubscriptionWidget';
import { UsagePlanWidget } from '@/app/components/billing/UsagePlanWidget';
import { DeadlineRadarWidget } from '@/app/components/dashboard/DeadlineRadarWidget';
import { LegalCalendarWidget } from '@/app/components/dashboard/LegalCalendarWidget';
import { NotificationCenterWidget } from '@/app/components/dashboard/NotificationCenterWidget';
import { AuditorPassWidget } from '@/app/components/dashboard/AuditorPassWidget';
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
    loading: () => (
      <div className="rounded-xl border border-gray-100 bg-white p-6 animate-pulse">
        <div className="h-4 w-48 bg-gray-200 rounded" />
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    ),
  },
);

const modules = [
  { id: 'tva', label: 'TVA', labelAr: 'الضريبة على القيمة المضافة', icon: Receipt, color: 'bg-blue-500', href: '/tva', deadline: '20 Mai', urgent: true },
  { id: 'is', label: 'IS Fiscal', labelAr: 'الضريبة على الشركات', icon: Calculator, color: 'bg-purple-500', href: '/is', deadline: '31 Mars', urgent: false },
  { id: 'ir', label: 'IR / Salaires', labelAr: 'الضريبة على الدخل', icon: TrendingUp, color: 'bg-green-500', href: '/ir', deadline: '30 Avril', urgent: false },
  { id: 'factures', label: 'Factures', labelAr: 'الفواتير', icon: FileText, color: 'bg-amber-500', href: '/factures', deadline: null, urgent: false },
  { id: 'inventaire', label: 'Inventaire', labelAr: 'المخزون', icon: Package, color: 'bg-teal-500', href: '/inventaire', deadline: null, urgent: false },
  { id: 'logistique', label: 'Logistique', labelAr: 'اللوجستيك', icon: Truck, color: 'bg-slate-600', href: '/logistique', deadline: null, urgent: false },
  { id: 'recouvrement', label: 'Recouvrement', labelAr: 'التحصيل', icon: Gavel, color: 'bg-red-600', href: '/recouvrement', deadline: null, urgent: false },
  { id: 'caisse', label: 'Caisse', labelAr: 'الصندوق', icon: Wallet, color: 'bg-yellow-600', href: '/caisse', deadline: null, urgent: false },
  { id: 'auto-entrepreneur', label: 'Auto-entrepreneur', labelAr: 'المقاول الذاتي', icon: Briefcase, color: 'bg-sky-600', href: '/auto-entrepreneur', deadline: null, urgent: false },
  { id: 'personne-physique', label: 'Personne physique', labelAr: 'شخص ذاتي', icon: UserRound, color: 'bg-indigo-600', href: '/personne-physique', deadline: null, urgent: false },
  { id: 'clients', label: 'Clients', labelAr: 'العملاء', icon: Users, color: 'bg-emerald-500', href: '/clients', deadline: null, urgent: false },
  { id: 'comptabilite', label: 'Comptabilité', labelAr: 'المحاسبة', icon: LayoutDashboard, color: 'bg-cyan-500', href: '/comptabilite', deadline: null, urgent: false },
  { id: 'documents', label: 'Documents IA', labelAr: 'وثائق الذكاء الاصطناعي', icon: Upload, color: 'bg-rose-500', href: '/documents', deadline: null, urgent: false },
  { id: 'consultant', label: 'Consultant IA', labelAr: 'المستشار الذكي', icon: Brain, color: 'bg-indigo-500', href: '/consultant', deadline: null, urgent: false },
];

export default function Home() {
  const router = useRouter();
  const [lang, setLang] = useState<'fr' | 'ar'>('fr');
  const [menuOpen, setMenuOpen] = useState(false);
  const [connected, setConnected] = useState(true);
  const [invoices, setInvoices] = useState<AtlasInvoice[]>([]);
  const [fiscalUrgentCount, setFiscalUrgentCount] = useState(0);
  const [deadlinesError, setDeadlinesError] = useState(false);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const t = (fr: string, ar: string) => lang === 'fr' ? fr : ar;

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
    return () => { cancelled = true; };
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
    return {
      totalFacture,
      unpaidCount: unpaid.length,
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, inv) => sum + (inv.totalTTC || 0), 0),
    };
  }, [invoices]);

  const kpis = useMemo(() => ([
    { label: "Chiffre d'affaires", labelAr: 'رقم الأعمال', value: formatMadAmountLabel(invoiceSummary.totalFacture), change: t('Factures enregistrées', 'فواتير مسجلة'), up: true, icon: TrendingUp, color: 'text-blue-600' },
    { label: 'TVA', labelAr: 'TVA', value: '—', change: t('En cours de stabilisation', 'قيد الاستقرار'), up: true, icon: Receipt, color: 'text-slate-500' },
    { label: 'Factures en attente', labelAr: 'فواتير معلقة', value: String(invoiceSummary.unpaidCount), change: `${invoiceSummary.overdueCount} ${t('en retard', 'متأخرة')}`, up: invoiceSummary.overdueCount === 0, icon: FileText, color: 'text-amber-600' },
    {
      label: 'Rappels fiscaux',
      labelAr: 'تذكير ضريبي',
      value: deadlinesError ? '!' : String(pendingFiscalCount),
      change: deadlinesError
        ? t('Échéances indisponibles', 'المواعيد غير متاحة')
        : t('Radar échéances', 'رادار المواعيد'),
      up: !deadlinesError && pendingFiscalCount === 0,
      icon: Calendar,
      color: deadlinesError ? 'text-red-600' : 'text-purple-600',
    },
  ]), [invoiceSummary, pendingFiscalCount, deadlinesError, lang]);

  const navigate = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  return (
    <div className="flex h-dvh bg-gray-50 overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

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
          className="bg-white border-b border-gray-200 px-3 sm:px-4 lg:px-8 py-3 lg:py-4 flex items-center justify-between shrink-0"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="lg:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-gray-100"
              aria-label={t('Menu', 'القائمة')}
            >
              <Menu size={22} className="text-gray-600" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg lg:text-xl font-bold text-gray-800 truncate">{t('Tableau de bord', 'لوحة التحكم')}</h1>
              <p className="text-xs text-gray-400 hidden sm:block">{new Date().toLocaleDateString(lang === 'fr' ? 'fr-MA' : 'ar-MA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <CompanySwitcher className="hidden sm:block" />
            <CompanyMasterExportMenu />
            <button
              type="button"
              onClick={() => navigate('/consultant')}
              className="hidden sm:flex items-center gap-2 min-h-11 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors"
            >
              <Brain size={16} />
              <span className="hidden md:inline">{t('Consultant IA', 'المستشار')}</span>
            </button>
            <GlobalSearchButton />
            <button
              type="button"
              onClick={() => setShowNotifications((v) => !v)}
              className="relative min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-gray-100"
              aria-label={t('Notifications', 'الإشعارات')}
            >
              <Bell size={18} className="text-gray-500" />
              {notificationUnread > 0 && (
                <span className="absolute top-1 right-1 min-w-[0.5rem] h-2 px-0.5 bg-red-500 rounded-full text-[8px] text-white font-bold flex items-center justify-center">
                  {notificationUnread > 9 ? '9+' : notificationUnread}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <div className="w-9 h-9 rounded-full bg-[#0F1F3D] flex items-center justify-center text-white text-sm font-bold">M</div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 lg:px-8 py-4 lg:py-6 space-y-4 lg:space-y-6 pb-mobile-nav" data-tour="dashboard">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-950 flex gap-2 items-start">
            <Shield size={16} className="shrink-0 mt-0.5 text-amber-700" aria-hidden />
            <p>
              {t(
                'Les échéances fiscales affichées ici sont indicatives. Les modules TVA, IS et déclarations sont en cours de stabilisation — validez toute obligation avec votre expert-comptable.',
                'المواعيد الضريبية المعروضة هنا إشارية. وحدات TVA وIS والتصاريح قيد الاستقرار — يُرجى التحقق مع خبيركم المحاسبي.',
              )}
            </p>
          </div>
          <ReferralPostOnboardingModal lang={lang} />
          <TrialUpgradeBanner />
          <DemoModeBanner lang={lang} />
          <GettingStartedWidget lang={lang} />
          <OnboardingChecklistWidget lang={lang} />
          <SmartRecommendationsWidget lang={lang} />
          <ReferralDashboardCard lang={lang} />
          <TrialOnboardingChecklist lang={lang} />
          <DashboardFunnelInsights lang={lang} pendingDeclarationsCount={pendingFiscalCount} />
          {invoiceSummary.overdueCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              <span className="font-semibold">Alertes paiements :</span> {invoiceSummary.overdueCount} facture(s) en retard — {formatMadAmountLabel(invoiceSummary.overdueAmount)}.
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {kpis.map((kpi, i) => (
              <div key={i} className="bg-white rounded-xl p-4 lg:p-5 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs text-gray-400 font-medium leading-tight">{t(kpi.label, kpi.labelAr)}</p>
                  <div className={`w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center ${kpi.color} shrink-0`}>
                    <kpi.icon size={14} />
                  </div>
                </div>
                <p className="text-xl lg:text-2xl font-bold text-gray-800">{kpi.value}</p>
                <div className="flex items-center gap-1 mt-1">
                  {kpi.up ? <ArrowUpRight size={11} className="text-green-500" /> : <ArrowDownRight size={11} className="text-red-500" />}
                  <span className={`text-xs ${kpi.up ? 'text-green-500' : 'text-red-500'}`}>{kpi.change}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <DeadlineRadarWidget lang={lang} />
            <LegalCalendarWidget lang={lang} />

            <div className="lg:col-span-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-700 text-sm">{t('Modules', 'الوحدات')}</h2>
                <span className="text-xs text-gray-400">{modules.length} {t('modules', 'وحدات')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:gap-3">
                {modules.map(m => (
                  <button key={m.id} onClick={() => navigate(m.href)}
                    className="bg-white rounded-xl p-3 lg:p-4 shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all text-left group relative overflow-hidden min-h-[4.5rem] active:scale-[0.99]">
                    {m.urgent && <span className="absolute top-2 right-2 w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>}
                    <div className="flex items-center gap-2 lg:gap-3">
                      <div className={`w-9 h-9 lg:w-9 lg:h-9 ${m.color} rounded-lg flex items-center justify-center shrink-0`}>
                        <m.icon size={16} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-xs lg:text-sm truncate">{t(m.label, m.labelAr)}</p>
                        {m.deadline && <p className="text-xs text-red-500 mt-0.5 hidden lg:block">⏰ {m.deadline}</p>}
                      </div>
                      <ChevronRight size={12} className="text-gray-300 group-hover:text-blue-400 shrink-0 hidden lg:block" />
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 lg:gap-3">
                <button onClick={() => window.open('https://www.tax.gov.ma', '_blank')} className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors">
                  <Shield size={14} className="text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-blue-700 truncate">DGI · SIMPL</p>
                    <p className="text-xs text-blue-400 hidden lg:block">{t('Portail fiscal', 'الضرائب')}</p>
                  </div>
                </button>
                <button onClick={() => window.open('https://www.cnss.ma', '_blank')} className="flex items-center gap-2 p-2.5 bg-green-50 rounded-xl border border-green-100 hover:bg-green-100 transition-colors">
                  <Users size={14} className="text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-green-700">CNSS</p>
                    <p className="text-xs text-green-400 hidden lg:block">{t('Sécurité sociale', 'الضمان')}</p>
                  </div>
                </button>
                <button onClick={() => navigate('/consultant')} className="flex items-center gap-2 p-2.5 bg-indigo-50 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors">
                  <Zap size={14} className="text-indigo-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-indigo-700 truncate">{t('Conseil IA', 'مستشار')}</p>
                    <p className="text-xs text-indigo-400 hidden lg:block">{t('Question', 'سؤال')}</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* ── Notifications + Auditor pass ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <div className={showNotifications ? 'lg:col-span-2' : 'lg:col-span-2'}>
              <NotificationCenterWidget onUnreadChange={setNotificationUnread} />
            </div>
            <AuditorPassWidget />
          </div>

          {/* ── Alert Center + Legal + Audit ────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <div className="lg:col-span-2">
              <AlertCenterWidget />
            </div>
            <div className="lg:col-span-1">
              <LegalContractsWidget />
            </div>
          </div>

          {/* ── Banking & Payroll ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <LiasseReadinessWidget />
            <ReconciliationWidget />
            <BankAlertCenter compact />
          </div>
          <PayrollDashboardSection />

          {/* ── Subscription + Utilisation & Forfait ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <SubscriptionWidget />
            <UsagePlanWidget />
          </div>

          {/* ── Cabinet consolidated (Phase 14) ─────────────────────────── */}
          <ConsolidatedDashboardWidget />

          {/* ── AI Insights + Closing + Executive (Phase 13) ──────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <AIInsightsWidget />
            <FiscalClosingAssistantWidget />
            <ExecutiveSummaryWidget />
          </div>

          {/* ── Documents IA — Validation KPIs + Queue ───────────────────── */}
          <DashboardIaSection />

          {/* ── Audit Activity + Usage ─────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <div className="lg:col-span-1">
              <UsageWidget />
            </div>
            <div className="lg:col-span-2">
              <AuditStatsWidget />
            </div>
          </div>
        </div>
      </main>
      <MobileBottomNav onOpenMenu={() => setMenuOpen(true)} />
      <GuidedTourEngine lang={lang} autoStart />
      <FeedbackWidget lang={lang} />
    </div>
  );
}
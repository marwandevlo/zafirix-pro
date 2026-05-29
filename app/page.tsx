'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, FileText, Receipt, Calculator,
  TrendingUp, Upload, Bell, ChevronRight,
  AlertCircle, CheckCircle, Brain,
  ArrowUpRight, ArrowDownRight, Calendar, Globe,
  Users, Zap, Shield, Clock, Menu,
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
import { DashboardFunnelInsights } from '@/app/components/conversion/DashboardFunnelInsights';
import { AppSidebar, AppSidebarMobileOverlay } from '@/app/components/shell/AppSidebar';
import { ReferralDashboardCard } from '@/app/components/referral/ReferralDashboardCard';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';

const ReferralPostOnboardingModal = dynamic(
  () =>
    import('@/app/components/referral/ReferralPostOnboardingModal').then((m) => ({
      default: m.ReferralPostOnboardingModal,
    })),
  { ssr: false },
);

const modules = [
  { id: 'tva', label: 'TVA', labelAr: 'الضريبة على القيمة المضافة', icon: Receipt, color: 'bg-blue-500', href: '/tva', deadline: '20 Mai', urgent: true },
  { id: 'is', label: 'IS Fiscal', labelAr: 'الضريبة على الشركات', icon: Calculator, color: 'bg-purple-500', href: '/is', deadline: '31 Mars', urgent: false },
  { id: 'ir', label: 'IR / Salaires', labelAr: 'الضريبة على الدخل', icon: TrendingUp, color: 'bg-green-500', href: '/ir', deadline: '30 Avril', urgent: false },
  { id: 'factures', label: 'Factures', labelAr: 'الفواتير', icon: FileText, color: 'bg-amber-500', href: '/factures', deadline: null, urgent: false },
  { id: 'clients', label: 'Clients', labelAr: 'العملاء', icon: Users, color: 'bg-emerald-500', href: '/clients', deadline: null, urgent: false },
  { id: 'comptabilite', label: 'Comptabilité', labelAr: 'المحاسبة', icon: LayoutDashboard, color: 'bg-cyan-500', href: '/comptabilite', deadline: null, urgent: false },
  { id: 'documents', label: 'Documents IA', labelAr: 'وثائق الذكاء الاصطناعي', icon: Upload, color: 'bg-rose-500', href: '/documents', deadline: null, urgent: false },
  { id: 'consultant', label: 'Consultant IA', labelAr: 'المستشار الذكي', icon: Brain, color: 'bg-indigo-500', href: '/consultant', deadline: null, urgent: false },
];

const deadlines = [
  { label: 'Déclaration TVA mensuelle', labelAr: 'التصريح الشهري بالـ TVA', date: '20 mai 2026', jours: 3, type: 'danger', lien: 'https://www.tax.gov.ma' },
  { label: 'Virement CNSS', labelAr: 'تحويل CNSS', date: '25 Mai 2026', jours: 8, type: 'warning', lien: 'https://www.cnss.ma' },
  { label: 'Acompte IS (2eme)', labelAr: 'الدفعة الثانية IS', date: '31 Mai 2026', jours: 14, type: 'info', lien: 'https://www.tax.gov.ma' },
  { label: 'Déclaration IR salaires', labelAr: 'تصريح IR الرواتب', date: '30 juin 2026', jours: 44, type: 'ok', lien: 'https://www.tax.gov.ma' },
];

export default function Home() {
  const router = useRouter();
  const [lang, setLang] = useState<'fr' | 'ar'>('fr');
  const [menuOpen, setMenuOpen] = useState(false);
  const [connected, setConnected] = useState(true);
  const [invoices, setInvoices] = useState<AtlasInvoice[]>([]);
  const t = (fr: string, ar: string) => lang === 'fr' ? fr : ar;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isAtlasSupabaseDataEnabled()) {
        await refreshAtlasUsageState();
      }
      const inv = await listAtlasInvoices();
      if (!cancelled) setInvoices(inv);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingFiscalCount = useMemo(
    () => deadlines.filter((d) => d.type === 'danger' || d.type === 'warning').length,
    [],
  );

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
    { label: 'Rappels fiscaux (indicatif)', labelAr: 'تذكير ضريبي (إشاري)', value: String(pendingFiscalCount), change: t('Calendrier indicatif', 'جدول إشاري'), up: true, icon: Calendar, color: 'text-purple-600' },
  ]), [invoiceSummary, pendingFiscalCount, lang]);

  const deadlineColor = (type: string) => {
    if (type === 'danger') return 'bg-red-50 border-red-200 text-red-700';
    if (type === 'warning') return 'bg-amber-50 border-amber-200 text-amber-700';
    if (type === 'info') return 'bg-blue-50 border-blue-200 text-blue-700';
    return 'bg-green-50 border-green-200 text-green-700';
  };

  const deadlineIcon = (type: string) => {
    if (type === 'danger' || type === 'warning') return <AlertCircle size={14} />;
    return <CheckCircle size={14} />;
  };

  const navigate = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  return (
    <div className="flex h-screen bg-gray-50" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

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
        <header className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
              <Menu size={20} className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg lg:text-xl font-bold text-gray-800">{t('Tableau de bord', 'لوحة التحكم')}</h1>
              <p className="text-xs text-gray-400 hidden sm:block">{new Date().toLocaleDateString(lang === 'fr' ? 'fr-MA' : 'ar-MA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/consultant')} className="hidden sm:flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors">
              <Brain size={16} />
              <span className="hidden md:inline">{t('Consultant IA', 'المستشار')}</span>
            </button>
            <GlobalSearchButton />
            <button className="relative p-2 rounded-lg hover:bg-gray-100">
              <Bell size={18} className="text-gray-500" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <div className="w-9 h-9 rounded-full bg-[#0F1F3D] flex items-center justify-center text-white text-sm font-bold">M</div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-4 lg:py-6 space-y-4 lg:space-y-6">
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                  <Clock size={14} className="text-red-500" />
                  {t('Échéances fiscales', 'المواعيد الضريبية')}
                </h2>
                <span className="text-xs text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded-full">
                  {t('Indicatif', 'إشاري')}
                </span>
              </div>
              <div className="p-3 space-y-2">
                {deadlines.map((d, i) => (
                  <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs ${deadlineColor(d.type)}`}>
                    <div className="mt-0.5 shrink-0">{deadlineIcon(d.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t(d.label, d.labelAr)}</p>
                      <p className="opacity-70 mt-0.5">{d.date}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-bold">{d.jours}j</span>
                      <button onClick={() => window.open(d.lien, '_blank')} className="opacity-60 hover:opacity-100">
                        <Globe size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-700 text-sm">{t('Modules', 'الوحدات')}</h2>
                <span className="text-xs text-gray-400">{modules.length} {t('modules', 'وحدات')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:gap-3">
                {modules.map(m => (
                  <button key={m.id} onClick={() => navigate(m.href)}
                    className="bg-white rounded-xl p-3 lg:p-4 shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all text-left group relative overflow-hidden">
                    {m.urgent && <span className="absolute top-2 right-2 w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>}
                    <div className="flex items-center gap-2 lg:gap-3">
                      <div className={`w-8 h-8 lg:w-9 lg:h-9 ${m.color} rounded-lg flex items-center justify-center shrink-0`}>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <div className="lg:col-span-1">
              <UsageWidget />
            </div>
            <div className="lg:col-span-2" />
          </div>
        </div>
      </main>
    </div>
  );
}
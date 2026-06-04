'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { HelpHint } from '@/app/components/onboarding/HelpHint';
import {
  advanceWizardStep,
  computeCompanyCompletionScore,
  loadOnboardingProgress,
  saveOnboardingProgress,
  validateMoroccanIce,
  validateMoroccanIf,
  wizardProgressPercent,
  wizardStepIndex,
} from '@/app/lib/atlas-onboarding-engine';
import { SETUP_WIZARD_STEPS, type SetupWizardStepId } from '@/app/types/atlas-onboarding';
import { getActiveAtlasCompany, saveActiveCompanyFields } from '@/app/lib/atlas-active-company';
import { completeAtlasOnboarding } from '@/app/lib/atlas-profiles-repository';
import {
  trackOnboardingCompleted,
  trackOnboardingStarted,
  trackWizardAbandoned,
  trackWizardStep,
} from '@/app/lib/atlas-onboarding-analytics';

const STEP_LABELS: Record<SetupWizardStepId, { fr: string; ar: string }> = {
  company: { fr: 'Société', ar: 'الشركة' },
  fiscal: { fr: 'Fiscal', ar: 'ضريبي' },
  tva: { fr: 'TVA', ar: 'TVA' },
  accounting: { fr: 'Comptabilité', ar: 'محاسبة' },
  payroll: { fr: 'Paie', ar: 'رواتب' },
  banking: { fr: 'Banque', ar: 'بنك' },
  finish: { fr: 'Terminer', ar: 'إنهاء' },
};

export default function SetupWizardPage() {
  const router = useRouter();
  const [lang, setLang] = useState<'fr' | 'ar'>('fr');
  const [step, setStep] = useState<SetupWizardStepId>('company');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const t = useMemo(() => (fr: string, ar: string) => (lang === 'ar' ? ar : fr), [lang]);

  const [companyForm, setCompanyForm] = useState({
    raisonSociale: '',
    ice: '',
    rc: '',
    if_fiscal: '',
    cnss: '',
    adresse: '',
    telephone: '',
    email: '',
  });
  const [fiscalForm, setFiscalForm] = useState({ formeJuridique: 'SARL', exerciceFiscal: '2026', activite: '' });
  const [tvaForm, setTvaForm] = useState({ regimeTVA: 'mensuel', tauxDefaut: '20' });
  const [accountingForm, setAccountingForm] = useState({ planComptable: 'PCG', journalAuto: true });
  const [payrollForm, setPayrollForm] = useState({ cnssActive: true, irActive: true });
  const [bankingForm, setBankingForm] = useState({ bankName: '', rib: '', imported: false });

  const companyScore = computeCompanyCompletionScore(companyForm);
  const progressPct = wizardProgressPercent(step, false);

  const persistStep = useCallback(
    (nextStep: SetupWizardStepId, extra?: Record<string, unknown>) => {
      const p = loadOnboardingProgress();
      const stepData = { ...p.stepData, [step]: { ...(p.stepData[step] ?? {}), ...extra } };
      saveOnboardingProgress({
        ...p,
        wizardStep: nextStep,
        startedAt: p.startedAt ?? new Date().toISOString(),
        stepData,
      });
      void fetch('/api/onboarding/progress', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'onboarding_wizard_step', step: nextStep }),
      });
    },
    [step],
  );

  useEffect(() => {
    const p = loadOnboardingProgress();
    setStep(p.wizardStep);
    if (!p.startedAt) {
      trackOnboardingStarted('setup_wizard');
      saveOnboardingProgress({ ...p, startedAt: new Date().toISOString() });
    }
    trackWizardStep(p.wizardStep, 'enter');
    void (async () => {
      const active = await getActiveAtlasCompany();
      if (active) {
        setCompanyForm({
          raisonSociale: active.raisonSociale ?? '',
          ice: active.ice ?? '',
          rc: active.rc ?? '',
          if_fiscal: active.if_fiscal ?? '',
          cnss: active.cnss ?? '',
          adresse: active.adresse ?? '',
          telephone: active.telephone ?? '',
          email: active.email ?? '',
        });
        setFiscalForm({
          formeJuridique: active.formeJuridique ?? 'SARL',
          exerciceFiscal: '2026',
          activite: active.activite ?? '',
        });
        setTvaForm({ regimeTVA: active.regimeTVA ?? 'mensuel', tauxDefaut: '20' });
      }
    })();
    return () => {
      const cur = loadOnboardingProgress();
      if (!cur.wizardCompleted && cur.wizardStep !== 'finish') {
        trackWizardAbandoned(cur.wizardStep);
      }
    };
  }, []);

  const validateCompany = (): boolean => {
    if (!companyForm.raisonSociale.trim()) {
      setError(t('Raison sociale requise.', 'اسم الشركة مطلوب.'));
      return false;
    }
    if (companyForm.ice && !validateMoroccanIce(companyForm.ice)) {
      setError(t('ICE invalide (15 chiffres).', 'ICE غير صالح (15 رقم).'));
      return false;
    }
    if (companyForm.if_fiscal && !validateMoroccanIf(companyForm.if_fiscal)) {
      setError(t('IF invalide.', 'IF غير صالح.'));
      return false;
    }
    setError('');
    return true;
  };

  const saveCompany = async () => {
    if (!validateCompany()) return false;
    setSaving(true);
    try {
      const res = await saveActiveCompanyFields({
        raisonSociale: companyForm.raisonSociale,
        ice: companyForm.ice,
        rc: companyForm.rc,
        if_fiscal: companyForm.if_fiscal,
        cnss: companyForm.cnss,
        adresse: companyForm.adresse,
        telephone: companyForm.telephone,
        email: companyForm.email,
        formeJuridique: fiscalForm.formeJuridique as 'SARL',
        activite: fiscalForm.activite,
        regimeTVA: tvaForm.regimeTVA as 'mensuel',
      });
      if (!res.ok) {
        setError(t('Enregistrement impossible.', 'تعذر الحفظ.'));
        return false;
      }
      persistStep(step, { ...companyForm, score: companyScore });
      return true;
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    if (step === 'company' && !(await saveCompany())) return;
    if (step === 'fiscal') persistStep(step, fiscalForm);
    if (step === 'tva') persistStep(step, { ...tvaForm, configured: true });
    if (step === 'accounting') persistStep(step, accountingForm);
    if (step === 'payroll') persistStep(step, payrollForm);
    if (step === 'banking') persistStep(step, bankingForm);
    if (step === 'finish') {
      const p = loadOnboardingProgress();
      saveOnboardingProgress({
        ...p,
        wizardCompleted: true,
        completedAt: new Date().toISOString(),
      });
      await completeAtlasOnboarding();
      const started = p.startedAt ? new Date(p.startedAt).getTime() : Date.now();
      trackOnboardingCompleted(Math.round((Date.now() - started) / 1000));
      trackWizardStep('finish', 'complete');
      router.push('/');
      return;
    }
    trackWizardStep(step, 'complete');
    const next = advanceWizardStep(step);
    persistStep(next);
    setStep(next);
  };

  const goPrev = () => {
    const idx = wizardStepIndex(step);
    if (idx <= 0) return;
    const prev = SETUP_WIZARD_STEPS[idx - 1];
    setStep(prev);
    persistStep(prev);
  };

  const saveAndExit = () => {
    persistStep(step);
    router.push('/');
  };

  const renderStep = () => {
    switch (step) {
      case 'company':
        return (
          <div className="space-y-4">
            <HelpHint
              lang={lang}
              titleFr="Identité légale"
              titleAr="الهوية القانونية"
              bodyFr="Renseignez ICE (15 chiffres), RC, IF et CNSS pour activer TVA et paie."
              bodyAr="أدخل ICE وRC وIF وCNSS لتفعيل TVA والرواتب."
              learnMoreHref="/help"
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{t('Complétion société', 'اكتمال الشركة')}</span>
              <span className="font-bold text-indigo-600">{companyScore}%</span>
            </div>
            {(['raisonSociale', 'ice', 'rc', 'if_fiscal', 'cnss', 'adresse', 'telephone', 'email'] as const).map((key) => (
              <label key={key} className="block">
                <span className="text-xs font-medium text-gray-600 uppercase">{key.replace('_', ' ')}</span>
                <input
                  value={companyForm[key]}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
        );
      case 'fiscal':
        return (
          <div className="space-y-4">
            <HelpHint
              lang={lang}
              titleFr="Informations fiscales"
              titleAr="معلومات ضريبية"
              bodyFr="Forme juridique et exercice fiscal pour la liasse et les déclarations."
              bodyAr="الشكل القانوني والسنة المالية للحزمة والتصاريح."
            />
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Forme juridique</span>
              <select
                value={fiscalForm.formeJuridique}
                onChange={(e) => setFiscalForm((f) => ({ ...f, formeJuridique: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="SARL">SARL</option>
                <option value="SA">SA</option>
                <option value="SNC">SNC</option>
                <option value="Auto-entrepreneur">Auto-entrepreneur</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Exercice fiscal</span>
              <input
                value={fiscalForm.exerciceFiscal}
                onChange={(e) => setFiscalForm((f) => ({ ...f, exerciceFiscal: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Activité</span>
              <input
                value={fiscalForm.activite}
                onChange={(e) => setFiscalForm((f) => ({ ...f, activite: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
        );
      case 'tva':
        return (
          <div className="space-y-4">
            <HelpHint
              lang={lang}
              titleFr="Configuration TVA"
              titleAr="إعداد TVA"
              bodyFr="Régime mensuel ou trimestriel. Taux standard 20 % au Maroc."
              bodyAr="نظام شهري أو ربع سنوي. المعدل القياسي 20%."
              learnMoreHref="/help"
            />
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Régime TVA</span>
              <select
                value={tvaForm.regimeTVA}
                onChange={(e) => setTvaForm((f) => ({ ...f, regimeTVA: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="mensuel">Mensuel</option>
                <option value="trimestriel">Trimestriel</option>
                <option value="exonere">Exonéré</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Taux par défaut (%)</span>
              <select
                value={tvaForm.tauxDefaut}
                onChange={(e) => setTvaForm((f) => ({ ...f, tauxDefaut: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                {['20', '14', '10', '7', '0'].map((r) => (
                  <option key={r} value={r}>{r} %</option>
                ))}
              </select>
            </label>
          </div>
        );
      case 'accounting':
        return (
          <div className="space-y-4">
            <HelpHint
              lang={lang}
              titleFr="Plan comptable"
              titleAr="المخطط المحاسبي"
              bodyFr="PCG marocain par défaut. Le journal se remplit via Documents IA."
              bodyAr="PCG المغربي افتراضياً. يُملأ الدفتر عبر Documents IA."
            />
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Plan</span>
              <select
                value={accountingForm.planComptable}
                onChange={(e) => setAccountingForm((f) => ({ ...f, planComptable: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="PCG">PCG Maroc</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={accountingForm.journalAuto}
                onChange={(e) => setAccountingForm((f) => ({ ...f, journalAuto: e.target.checked }))}
              />
              {t('Écritures automatiques depuis Documents IA', 'قيود تلقائية من Documents IA')}
            </label>
          </div>
        );
      case 'payroll':
        return (
          <div className="space-y-4">
            <HelpHint
              lang={lang}
              titleFr="Paie & CNSS"
              titleAr="الرواتب وCNSS"
              bodyFr="Activez CNSS et IR pour préparer vos bulletins et déclarations."
              bodyAr="فعّل CNSS وIR لتحضير كشوف الرواتب."
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={payrollForm.cnssActive}
                onChange={(e) => setPayrollForm((f) => ({ ...f, cnssActive: e.target.checked }))}
              />
              CNSS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={payrollForm.irActive}
                onChange={(e) => setPayrollForm((f) => ({ ...f, irActive: e.target.checked }))}
              />
              IR salaires
            </label>
          </div>
        );
      case 'banking':
        return (
          <div className="space-y-4">
            <HelpHint
              lang={lang}
              titleFr="Compte bancaire"
              titleAr="الحساب البنكي"
              bodyFr="Importez vos relevés via Documents IA pour la réconciliation."
              bodyAr="استورد كشوفك عبر Documents IA للمطابقة."
            />
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Banque</span>
              <input
                value={bankingForm.bankName}
                onChange={(e) => setBankingForm((f) => ({ ...f, bankName: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Attijariwafa, BMCE…"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">RIB</span>
              <input
                value={bankingForm.rib}
                onChange={(e) => setBankingForm((f) => ({ ...f, rib: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
        );
      case 'finish':
        return (
          <div className="text-center py-8 space-y-4">
            <CheckCircle className="mx-auto text-emerald-500" size={48} />
            <p className="text-lg font-bold text-gray-900">{t('Configuration terminée !', 'اكتمل الإعداد!')}</p>
            <p className="text-sm text-gray-600">
              {t(
                'Uploadez votre première facture dans Documents IA pour atteindre votre première valeur en moins de 10 minutes.',
                'ارفع أول فاتورة في Documents IA خلال 10 دقائق.',
              )}
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <AppSidebar variant="module" lang={lang} setLang={setLang} />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Building2 className="text-indigo-600" size={22} />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('Assistant de configuration', 'معالج الإعداد')}</h1>
              <p className="text-sm text-gray-500">{progressPct}% · {t(STEP_LABELS[step].fr, STEP_LABELS[step].ar)}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {SETUP_WIZARD_STEPS.map((s, i) => (
              <div
                key={s}
                className={`shrink-0 h-1.5 flex-1 rounded-full ${wizardStepIndex(s) <= wizardStepIndex(step) ? 'bg-indigo-600' : 'bg-gray-200'}`}
                title={STEP_LABELS[s].fr}
              />
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-8 max-w-xl mx-auto w-full">
          {error ? <p className="text-sm text-red-600 mb-4">{error}</p> : null}
          {renderStep()}
        </div>

        <footer className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <button type="button" onClick={goPrev} disabled={step === 'company'} className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-40">
            <ChevronLeft size={16} /> {t('Précédent', 'السابق')}
          </button>
          <button type="button" onClick={saveAndExit} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
            <Save size={14} /> {t('Reprendre plus tard', 'متابعة لاحقاً')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void goNext()}
            className="flex items-center gap-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-indigo-700 disabled:opacity-50"
          >
            {step === 'finish' ? t('Accéder au tableau de bord', 'لوحة التحكم') : t('Suivant', 'التالي')}
            {step !== 'finish' ? <ChevronRight size={16} /> : null}
          </button>
        </footer>
      </main>
    </div>
  );
}

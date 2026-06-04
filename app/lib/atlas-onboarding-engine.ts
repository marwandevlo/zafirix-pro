/**
 * Phase 17 — Onboarding progress, checklist, completion scoring.
 */

import type { ChecklistItem, ChecklistItemId, OnboardingProgress, SetupWizardStepId } from '@/app/types/atlas-onboarding';
import { DEFAULT_ONBOARDING_PROGRESS, SETUP_WIZARD_STEPS } from '@/app/types/atlas-onboarding';

const STORAGE_KEY = 'atlas_onboarding_progress_v1';
const FIRST_RUN_KEY = 'atlas_first_run_seen_v1';

export function loadOnboardingProgress(): OnboardingProgress {
  if (typeof window === 'undefined') return { ...DEFAULT_ONBOARDING_PROGRESS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ONBOARDING_PROGRESS };
    return { ...DEFAULT_ONBOARDING_PROGRESS, ...JSON.parse(raw) } as OnboardingProgress;
  } catch {
    return { ...DEFAULT_ONBOARDING_PROGRESS };
  }
}

export function saveOnboardingProgress(progress: OnboardingProgress): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    window.dispatchEvent(new Event('atlas-onboarding-updated'));
  } catch {
    /* ignore */
  }
}

export function markFirstRunSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FIRST_RUN_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function isFirstRun(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !localStorage.getItem(FIRST_RUN_KEY);
  } catch {
    return false;
  }
}

export function advanceWizardStep(current: SetupWizardStepId): SetupWizardStepId {
  const idx = SETUP_WIZARD_STEPS.indexOf(current);
  if (idx < 0 || idx >= SETUP_WIZARD_STEPS.length - 1) return 'finish';
  return SETUP_WIZARD_STEPS[idx + 1];
}

export function wizardStepIndex(step: SetupWizardStepId): number {
  return SETUP_WIZARD_STEPS.indexOf(step);
}

export function wizardProgressPercent(step: SetupWizardStepId, completed: boolean): number {
  if (completed) return 100;
  const idx = wizardStepIndex(step);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / SETUP_WIZARD_STEPS.length) * 100);
}

export type ChecklistSignals = {
  hasCompany: boolean;
  tvaConfigured: boolean;
  hasDocument: boolean;
  hasInvoice: boolean;
  hasAiAnalysis: boolean;
  hasBankImport: boolean;
  hasPayrollRun: boolean;
  wizardCompleted: boolean;
};

export function buildChecklistItems(signals: ChecklistSignals): ChecklistItem[] {
  const items: Array<Omit<ChecklistItem, 'done'> & { id: ChecklistItemId }> = [
    { id: 'company_created', labelFr: 'Société créée', labelAr: 'تم إنشاء الشركة', href: '/companies' },
    { id: 'tva_configured', labelFr: 'TVA configurée', labelAr: 'تم إعداد TVA', href: '/setup' },
    { id: 'first_document', labelFr: 'Premier document uploadé', labelAr: 'أول وثيقة مرفوعة', href: '/documents' },
    { id: 'first_invoice', labelFr: 'Première facture créée', labelAr: 'أول فاتورة', href: '/factures' },
    { id: 'first_ai_analysis', labelFr: 'Première analyse IA', labelAr: 'أول تحليل ذكي', href: '/assistant' },
    { id: 'first_bank_import', labelFr: 'Premier import bancaire', labelAr: 'أول استيراد بنكي', href: '/banque' },
    { id: 'first_payroll_run', labelFr: 'Première paie exécutée', labelAr: 'أول مسير رواتب', href: '/rh' },
    { id: 'setup_wizard_done', labelFr: 'Assistant de configuration terminé', labelAr: 'اكتمل معالج الإعداد', href: '/setup' },
  ];

  const doneMap: Record<ChecklistItemId, boolean> = {
    company_created: signals.hasCompany,
    tva_configured: signals.tvaConfigured,
    first_document: signals.hasDocument,
    first_invoice: signals.hasInvoice,
    first_ai_analysis: signals.hasAiAnalysis,
    first_bank_import: signals.hasBankImport,
    first_payroll_run: signals.hasPayrollRun,
    setup_wizard_done: signals.wizardCompleted,
  };

  return items.map((item) => ({ ...item, done: doneMap[item.id] }));
}

export function checklistCompletionPercent(items: ChecklistItem[]): number {
  if (!items.length) return 0;
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

export function computeCompanyCompletionScore(fields: Record<string, string>): number {
  const keys = ['raisonSociale', 'ice', 'rc', 'if_fiscal', 'cnss', 'adresse', 'telephone', 'email'];
  const filled = keys.filter((k) => String(fields[k] ?? '').trim().length > 0).length;
  return Math.round((filled / keys.length) * 100);
}

export function validateMoroccanIce(ice: string): boolean {
  const digits = ice.replace(/\D/g, '');
  return digits.length === 15;
}

export function validateMoroccanIf(ifVal: string): boolean {
  const digits = ifVal.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 8;
}

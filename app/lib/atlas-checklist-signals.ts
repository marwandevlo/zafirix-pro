import type { AtlasCompany } from '@/app/types/atlas-company';
import { listAtlasClients } from '@/app/lib/atlas-clients-repository';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import {
  loadOnboardingProgress,
  saveOnboardingProgress,
  type ChecklistSignals,
} from '@/app/lib/atlas-onboarding-engine';
import { hydrateOnboardingProgress } from '@/app/lib/atlas-onboarding-progress-sync';

export function isCompanyCustomized(company: AtlasCompany | null | undefined): boolean {
  if (!company) return false;
  return [company.ice, company.adresse, company.rc, company.if_fiscal, company.telephone, company.activite, company.ville]
    .some((value) => String(value ?? '').trim().length > 0);
}

let lastChecklistSnapshot = '';

export async function loadChecklistSignals(): Promise<ChecklistSignals> {
  await hydrateOnboardingProgress();
  const progress = loadOnboardingProgress();
  let hasCompany = false;
  let hasClient = false;
  let hasInvoice = false;
  let companyCustomized = false;

  if (isAtlasSupabaseDataEnabled()) {
    const companies = await listAtlasCompanies();
    const active = companies.find((company) => company.actif) ?? companies[0] ?? null;
    const companyId = active?.dbRowId ? String(active.dbRowId) : null;
    const [clients, invoices] = await Promise.all([
      listAtlasClients(companyId ? { companyId } : undefined),
      listAtlasInvoices(),
    ]);
    hasCompany = companies.length > 0;
    hasClient = clients.length > 0;
    hasInvoice = invoices.length > 0;
    companyCustomized = isCompanyCustomized(active);
  }

  const stepTva = progress.stepData.tva as { configured?: boolean } | undefined;
  const signals: ChecklistSignals = {
    hasCompany,
    hasClient,
    hasInvoice,
    companyCustomized,
    tvaConfigured: Boolean(stepTva?.configured),
    hasDocument: Boolean(progress.stepData.company?.firstDocument),
    hasAiAnalysis: Boolean(progress.stepData.finish?.aiDone),
    hasBankImport: Boolean(progress.stepData.banking?.imported),
    hasPayrollRun: Boolean(progress.stepData.payroll?.runDone),
    wizardCompleted: progress.wizardCompleted,
  };

  const checklist = {
    first_invoice: signals.hasInvoice,
    first_client: signals.hasClient,
    company_customized: signals.companyCustomized,
  };
  const snapshot = JSON.stringify(checklist);
  if (snapshot !== lastChecklistSnapshot && snapshot !== JSON.stringify(progress.checklist ?? null)) {
    lastChecklistSnapshot = snapshot;
    saveOnboardingProgress({ ...progress, checklist });
  } else {
    lastChecklistSnapshot = snapshot;
  }

  return signals;
}

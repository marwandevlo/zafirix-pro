export type SetupWizardStepId =
  | 'company'
  | 'fiscal'
  | 'tva'
  | 'accounting'
  | 'payroll'
  | 'banking'
  | 'finish';

export const SETUP_WIZARD_STEPS: SetupWizardStepId[] = [
  'company',
  'fiscal',
  'tva',
  'accounting',
  'payroll',
  'banking',
  'finish',
];

export type ChecklistItemId =
  | 'company_created'
  | 'tva_configured'
  | 'first_document'
  | 'first_invoice'
  | 'first_ai_analysis'
  | 'first_bank_import'
  | 'first_payroll_run'
  | 'setup_wizard_done';

export type OnboardingProgress = {
  wizardStep: SetupWizardStepId;
  wizardCompleted: boolean;
  checklistDismissed: boolean;
  tourCompleted: boolean;
  demoMode: boolean;
  startedAt: string | null;
  completedAt: string | null;
  stepData: Partial<Record<SetupWizardStepId, Record<string, unknown>>>;
};

export type ChecklistItem = {
  id: ChecklistItemId;
  labelFr: string;
  labelAr: string;
  href: string;
  done: boolean;
};

export const DEFAULT_ONBOARDING_PROGRESS: OnboardingProgress = {
  wizardStep: 'company',
  wizardCompleted: false,
  checklistDismissed: false,
  tourCompleted: false,
  demoMode: false,
  startedAt: null,
  completedAt: null,
  stepData: {},
};

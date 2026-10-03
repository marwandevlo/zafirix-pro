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

export type ChecklistItemId = 'first_invoice' | 'first_client' | 'company_customized';

export type OnboardingChecklistSnapshot = {
  first_invoice?: boolean;
  first_client?: boolean;
  company_customized?: boolean;
};

export type OnboardingProgress = {
  wizardStep: SetupWizardStepId;
  wizardCompleted: boolean;
  checklistDismissed: boolean;
  tourCompleted: boolean;
  demoMode: boolean;
  startedAt: string | null;
  completedAt: string | null;
  stepData: Partial<Record<SetupWizardStepId, Record<string, unknown>>>;
  /** Milestone completion synced to the account (auth metadata), not only this browser. */
  checklist?: OnboardingChecklistSnapshot;
};

export type ChecklistItem = {
  id: ChecklistItemId;
  labelFr: string;
  labelAr: string;
  href: string;
  done: boolean;
  primary?: boolean;
  optional?: boolean;
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

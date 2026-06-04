/**
 * Phase 17 — Onboarding metrics (dashboard-ready).
 */

import type { OnboardingProgress } from '@/app/types/atlas-onboarding';
import { buildChecklistItems, checklistCompletionPercent, type ChecklistSignals } from '@/app/lib/atlas-onboarding-engine';

export type OnboardingMetrics = {
  wizardCompleted: boolean;
  wizardStep: string;
  checklistPercent: number;
  tourCompleted: boolean;
  demoMode: boolean;
  setupDurationSec: number | null;
  firstValueAchieved: boolean;
  abandoned: boolean;
  wizardAbandoned: boolean;
};

export function computeOnboardingMetrics(
  progress: OnboardingProgress,
  signals: ChecklistSignals,
): OnboardingMetrics {
  const items = buildChecklistItems(signals);
  const checklistPercent = checklistCompletionPercent(items);
  const firstValueAchieved =
    signals.hasDocument || signals.hasInvoice || signals.hasAiAnalysis || signals.hasBankImport;

  let setupDurationSec: number | null = null;
  if (progress.startedAt && progress.completedAt) {
    setupDurationSec = Math.round(
      (new Date(progress.completedAt).getTime() - new Date(progress.startedAt).getTime()) / 1000,
    );
  }

  const abandoned =
    Boolean(progress.startedAt) &&
    !progress.wizardCompleted &&
    progress.wizardStep !== 'company';

  return {
    wizardCompleted: progress.wizardCompleted,
    wizardStep: progress.wizardStep,
    checklistPercent,
    tourCompleted: progress.tourCompleted,
    demoMode: progress.demoMode,
    setupDurationSec,
    firstValueAchieved,
    abandoned,
    wizardAbandoned: abandoned,
  };
}

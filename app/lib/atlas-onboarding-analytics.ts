/**
 * Phase 17 — Onboarding analytics helpers.
 */

import { trackEvent } from '@/app/lib/analytics-track';

export function trackOnboardingStarted(source: string): void {
  trackEvent('onboarding_started', { source });
}

export function trackOnboardingCompleted(durationSec?: number): void {
  trackEvent('onboarding_completed', { duration_sec: durationSec ?? null });
}

export function trackWizardStep(step: string, action: 'enter' | 'complete' | 'skip'): void {
  trackEvent('onboarding_wizard_step', { step, action });
}

export function trackWizardAbandoned(step: string): void {
  trackEvent('onboarding_wizard_abandoned', { step });
}

export function trackTourCompleted(): void {
  trackEvent('onboarding_tour_completed', {});
}

export function trackFirstValue(kind: string): void {
  trackEvent('onboarding_first_value', { kind });
}

export function trackFeedbackSubmitted(rating: number, kind: string): void {
  trackEvent('feedback_submitted', { rating, kind });
}

export function trackChecklistProgress(percent: number): void {
  trackEvent('onboarding_checklist_progress', { percent });
}

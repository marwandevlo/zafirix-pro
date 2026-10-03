/**
 * Checklist progress lives in auth user metadata so it follows the account
 * across devices. localStorage stays a cache for instant reads.
 */

import type { OnboardingProgress } from '@/app/types/atlas-onboarding';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import {
  loadOnboardingProgress,
  writeOnboardingProgressLocal,
} from '@/app/lib/atlas-onboarding-engine';
import { supabase } from '@/app/lib/supabase';

const META_KEY = 'atlas_onboarding_progress';

function isProgress(value: unknown): value is Partial<OnboardingProgress> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function hydrateOnboardingProgress(): Promise<void> {
  if (typeof window === 'undefined' || !isAtlasSupabaseDataEnabled()) return;
  if (sessionStorage.getItem('atlas_onboarding_hydrated') === '1') return;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return;
    const remote = (data.user.user_metadata as Record<string, unknown> | undefined)?.[META_KEY];
    sessionStorage.setItem('atlas_onboarding_hydrated', '1');
    if (!isProgress(remote)) return;

    const local = loadOnboardingProgress();
    const localEmpty = !local.startedAt && !local.wizardCompleted && !local.checklistDismissed && !local.checklist;
    if (!localEmpty) return;

    writeOnboardingProgressLocal({ ...loadOnboardingProgress(), ...remote }, false);
  } catch (error) {
    console.warn('[onboarding] hydrate failed', error instanceof Error ? error.message : error);
  }
}

let lastPushed = '';

export async function pushOnboardingProgress(progress: OnboardingProgress): Promise<void> {
  if (typeof window === 'undefined' || !isAtlasSupabaseDataEnabled()) return;
  const serialized = JSON.stringify(progress);
  if (serialized === lastPushed) return;
  lastPushed = serialized;

  try {
    const { error } = await supabase.auth.updateUser({
      data: { [META_KEY]: progress },
    });
    if (error) {
      lastPushed = '';
      console.warn('[onboarding] progress sync failed', error.message);
    }
  } catch (error) {
    lastPushed = '';
    console.warn('[onboarding] progress sync failed', error instanceof Error ? error.message : error);
  }
}

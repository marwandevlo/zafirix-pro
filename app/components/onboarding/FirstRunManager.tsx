'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { getAtlasProfile } from '@/app/lib/atlas-profiles-repository';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { loadOnboardingProgress, isFirstRun, markFirstRunSeen } from '@/app/lib/atlas-onboarding-engine';
import { trackOnboardingStarted } from '@/app/lib/atlas-onboarding-analytics';

const SKIP_PATHS = ['/login', '/signup', '/landing', '/onboarding', '/setup', '/help', '/access-denied', '/pending-approval'];

export function FirstRunManager() {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    if (!pathname || SKIP_PATHS.some((p) => pathname.startsWith(p))) {
      setChecked(true);
      return;
    }
    if (!isAtlasSupabaseDataEnabled()) {
      setChecked(true);
      return;
    }

    void (async () => {
      const profile = await getAtlasProfile();
      if (!profile) {
        setChecked(true);
        return;
      }

      const progress = loadOnboardingProgress();
      const firstLogin = isFirstRun();

      if (firstLogin) {
        markFirstRunSeen();
        trackOnboardingStarted('first_run');
      }

      if (!profile.full_name?.trim() && pathname !== '/onboarding') {
        router.replace('/onboarding');
        setChecked(true);
        return;
      }

      const companies = await listAtlasCompanies();
      const needsSetup = !progress.wizardCompleted && companies.length > 0;

      if (needsSetup && pathname !== '/setup' && firstLogin) {
        router.replace('/setup');
      }

      setChecked(true);
    })();
  }, [checked, pathname, router]);

  return null;
}

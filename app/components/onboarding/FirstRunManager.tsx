'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { getAtlasProfile } from '@/app/lib/atlas-profiles-repository';
import { isFirstRun, markFirstRunSeen } from '@/app/lib/atlas-onboarding-engine';
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

      if (isFirstRun()) {
        markFirstRunSeen();
        trackOnboardingStarted('first_run');
      }

      // Name can be completed later. Never pull a user off the first invoice,
      // and never force the fiscal wizard — /setup is optional.
      const onInvoicePath = pathname.startsWith('/factures');
      if (!profile.full_name?.trim() && pathname !== '/onboarding' && !onInvoicePath) {
        router.replace('/onboarding');
      }

      setChecked(true);
    })();
  }, [checked, pathname, router]);

  return null;
}

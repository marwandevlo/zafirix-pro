'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageView } from '@/app/lib/atlas-pageview-track';
import { captureReferralFromWindow, logReferralLandingClick } from '@/app/lib/atlas-referral-client';
import { runWhenIdle } from '@/app/lib/atlas-telemetry-client';

/** Lightweight SPA page-view + referral capture. Renders nothing. */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    return runWhenIdle(() => {
      trackPageView(pathname);
      const code = captureReferralFromWindow();
      if (code) logReferralLandingClick(code);
    });
  }, [pathname]);

  return null;
}

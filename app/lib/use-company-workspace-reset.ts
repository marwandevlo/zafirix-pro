'use client';

import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';

/**
 * Instantly wipe component state on company switch (before optional reload).
 * Uses flushSync so empty arrays render before async fetches start.
 */
export function useCompanyWorkspaceReset(
  onReset: (companyId: string | null) => void,
  onReload?: (companyId: string | null) => void,
): void {
  const resetRef = useRef(onReset);
  const reloadRef = useRef(onReload);
  resetRef.current = onReset;
  reloadRef.current = onReload;

  useEffect(() => {
    return onCompanySwitched((companyId) => {
      flushSync(() => {
        resetRef.current(companyId);
      });
      reloadRef.current?.(companyId);
    });
  }, []);
}

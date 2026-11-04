'use client';

import { Suspense } from 'react';
import { Compare } from '../_studio/Compare';
import { StudioShell } from '../_studio/Shell';

export default function EtudeProjetComparePage() {
  return (
    <StudioShell>
      <Suspense fallback={null}>
        <Compare />
      </Suspense>
    </StudioShell>
  );
}

'use client';

import { SoundEffectsProvider } from '@/app/components/sound/SoundEffectsProvider';

/** Global sound FX context (control lives in AppSidebar). */
export function SoundEffectsGlobalChrome({ children }: { children: React.ReactNode }) {
  return <SoundEffectsProvider>{children}</SoundEffectsProvider>;
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_SOUND_PREFERENCES,
  playSoundEffect,
  primeSoundEffects,
  readSoundPreferences,
  writeSoundPreferences,
  type SoundEffectId,
  type SoundPreferences,
} from '@/app/lib/sound-effects';

type SoundEffectsContextValue = {
  enabled: boolean;
  volume: number;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  toggleEnabled: () => void;
  play: (id: SoundEffectId) => void;
};

const SoundEffectsContext = createContext<SoundEffectsContextValue | null>(null);

export function SoundEffectsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<SoundPreferences>(DEFAULT_SOUND_PREFERENCES);

  useEffect(() => {
    setPrefs(readSoundPreferences());
  }, []);

  const persist = useCallback((next: SoundPreferences) => {
    setPrefs(next);
    writeSoundPreferences(next);
  }, []);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      persist({ ...readSoundPreferences(), enabled });
    },
    [persist],
  );

  const setVolume = useCallback(
    (volume: number) => {
      const v = Math.max(0, Math.min(1, volume));
      persist({ ...readSoundPreferences(), volume: v });
    },
    [persist],
  );

  const toggleEnabled = useCallback(() => {
    const current = readSoundPreferences();
    const nextEnabled = !current.enabled;
    persist({ ...current, enabled: nextEnabled });
    if (nextEnabled) {
      primeSoundEffects();
      void playSoundEffect('click', { ...current, enabled: true });
    }
  }, [persist]);

  const play = useCallback(
    (id: SoundEffectId) => {
      primeSoundEffects();
      void playSoundEffect(id, readSoundPreferences());
    },
    [],
  );

  const value = useMemo<SoundEffectsContextValue>(
    () => ({
      enabled: prefs.enabled,
      volume: prefs.volume,
      setEnabled,
      setVolume,
      toggleEnabled,
      play,
    }),
    [prefs.enabled, prefs.volume, setEnabled, setVolume, toggleEnabled, play],
  );

  return <SoundEffectsContext.Provider value={value}>{children}</SoundEffectsContext.Provider>;
}

export function useSoundEffects(): SoundEffectsContextValue {
  const ctx = useContext(SoundEffectsContext);
  if (!ctx) {
    return {
      enabled: false,
      volume: 0,
      setEnabled: () => {},
      setVolume: () => {},
      toggleEnabled: () => {},
      play: () => {},
    };
  }
  return ctx;
}

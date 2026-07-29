'use client';

import { useState } from 'react';
import { ChevronDown, Volume2, VolumeX } from 'lucide-react';
import { useSoundEffects } from '@/app/components/sound/SoundEffectsProvider';

type Props = {
  /** Optional FR/AR label helper from AppSidebar */
  t?: (fr: string, ar: string) => string;
};

/**
 * Sidebar-embedded sound widget — mute toggle + inline volume panel.
 */
export function SoundEffectsSidebarControl({ t }: Props) {
  const { enabled, volume, toggleEnabled, setVolume, play } = useSoundEffects();
  const [open, setOpen] = useState(false);
  const volumePct = Math.round(volume * 100);

  const label = t ? t('Effets sonores', 'المؤثرات الصوتية') : 'Effets sonores';
  const muteLabel = t
    ? enabled
      ? t('Couper le son', 'كتم الصوت')
      : t('Activer le son', 'تفعيل الصوت')
    : enabled
      ? 'Couper le son'
      : 'Activer le son';

  return (
    <div className="px-3 py-3 border-t border-white/10" data-sound-control>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) play('click');
        }}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-white/50 hover:bg-white/10 hover:text-white"
      >
        {enabled ? (
          <Volume2 size={16} className="shrink-0 text-white/60" aria-hidden />
        ) : (
          <VolumeX size={16} className="shrink-0 text-white/40" aria-hidden />
        )}
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-2 mx-1 rounded-lg bg-white/5 px-3 py-3 space-y-3">
          <label className="flex items-center gap-2 text-xs text-white/50">
            <Volume2 size={14} className="shrink-0 text-white/40" aria-hidden />
            <input
              type="range"
              min={0}
              max={100}
              value={volumePct}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setVolume(v);
                if (v > 0 && enabled) play('click');
              }}
              className="flex-1 h-1.5 accent-amber-400 cursor-pointer"
              aria-label={t ? t('Volume des effets sonores', 'مستوى الصوت') : 'Volume des effets sonores'}
            />
            <span className="w-8 tabular-nums text-right text-white/40">{volumePct}%</span>
          </label>
          <button
            type="button"
            onClick={() => toggleEnabled()}
            className="w-full rounded-lg border border-white/10 px-2 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            {muteLabel}
          </button>
        </div>
      )}
    </div>
  );
}

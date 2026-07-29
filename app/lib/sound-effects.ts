/**
 * Lightweight UI sound effects via Web Audio API (no asset files).
 */

export type SoundEffectId = 'click' | 'success' | 'error' | 'notification';

export type SoundPreferences = {
  enabled: boolean;
  /** 0–1 */
  volume: number;
};

export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = {
  enabled: true,
  volume: 0.35,
};

const STORAGE_KEY = 'atlas_sound_effects_prefs';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* user gesture may be required */
    }
  }
}

function playTone(
  ctx: AudioContext,
  opts: { frequency: number; duration: number; volume: number; type?: OscillatorType; attack?: number },
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.frequency, ctx.currentTime);
  const peak = Math.max(0, Math.min(1, opts.volume));
  const attack = opts.attack ?? 0.008;
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(peak, ctx.currentTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + opts.duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + opts.duration + 0.02);
}

function playSequence(
  ctx: AudioContext,
  notes: Array<{ frequency: number; at: number; duration: number }>,
  volume: number,
) {
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const t0 = ctx.currentTime + note.at;
    osc.frequency.setValueAtTime(note.frequency, t0);
    const peak = Math.max(0, Math.min(1, volume * 0.85));
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + note.duration + 0.02);
  }
}

/** Read persisted sound preferences (browser only). */
export function readSoundPreferences(): SoundPreferences {
  if (typeof window === 'undefined') return DEFAULT_SOUND_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOUND_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<SoundPreferences>;
    return {
      enabled: parsed.enabled ?? DEFAULT_SOUND_PREFERENCES.enabled,
      volume:
        typeof parsed.volume === 'number'
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_SOUND_PREFERENCES.volume,
    };
  } catch {
    return DEFAULT_SOUND_PREFERENCES;
  }
}

/** Persist sound preferences. */
export function writeSoundPreferences(prefs: SoundPreferences): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/** Play a UI sound if enabled. Safe to call from any client event handler. */
export async function playSoundEffect(
  id: SoundEffectId,
  prefs: SoundPreferences = readSoundPreferences(),
): Promise<void> {
  if (!prefs.enabled || prefs.volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  await ensureRunning(ctx);

  const v = prefs.volume;

  switch (id) {
    case 'click':
      playTone(ctx, { frequency: 620, duration: 0.045, volume: v * 0.25, type: 'triangle' });
      break;
    case 'success':
      playSequence(ctx, [
        { frequency: 523.25, at: 0, duration: 0.09 },
        { frequency: 659.25, at: 0.08, duration: 0.12 },
      ], v);
      break;
    case 'error':
      playTone(ctx, { frequency: 220, duration: 0.14, volume: v * 0.4, type: 'square' });
      break;
    case 'notification':
      playSequence(ctx, [
        { frequency: 880, at: 0, duration: 0.07 },
        { frequency: 1174.66, at: 0.06, duration: 0.1 },
      ], v * 0.7);
      break;
    default:
      break;
  }
}

/** Prime audio on first user interaction (mobile autoplay policies). */
export function primeSoundEffects(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  void ensureRunning(ctx);
}

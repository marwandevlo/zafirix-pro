'use client';

import { useCallback, useState } from 'react';
import { Check, Link2, Loader2, AlertCircle } from 'lucide-react';
import type { AtlasCompany } from '@/app/types/atlas-company';
import { buildClientPortalUrlForCompany } from '@/app/lib/atlas-client-portal-links';
import { useSoundEffects } from '@/app/components/sound/SoundEffectsProvider';

type Props = {
  company: AtlasCompany;
  className?: string;
};

type CopyState = 'idle' | 'loading' | 'copied' | 'error';

/** Copy shareable client portal URL for a company (clipboard, inline feedback). */
export function CopyClientPortalLinkButton({ company, className = '' }: Props) {
  const [state, setState] = useState<CopyState>('idle');
  const [hint, setHint] = useState('');
  const { play } = useSoundEffects();

  const copyLink = useCallback(async () => {
    setState('loading');
    setHint('');
    try {
      let url: string | null = null;

      if (company.dbRowId) {
        const res = await fetch(
          `/api/client-portal/link?companyId=${encodeURIComponent(company.dbRowId)}`,
          { credentials: 'include' },
        );
        const data = (await res.json()) as { url?: string; message?: string; error?: string };
        if (!res.ok) {
          setHint(data.message ?? 'Code portail client manquant pour cette société.');
          setState('error');
          play('error');
          window.setTimeout(() => {
            setState('idle');
            setHint('');
          }, 2800);
          return;
        }
        url = data.url ?? null;
      } else {
        url = buildClientPortalUrlForCompany(company);
        if (!url) {
          setHint('Code portail client non configuré.');
          setState('error');
          play('error');
          window.setTimeout(() => {
            setState('idle');
            setHint('');
          }, 2800);
          return;
        }
      }

      if (!url) {
        setHint('Lien portail indisponible.');
        setState('error');
        play('error');
        window.setTimeout(() => {
          setState('idle');
          setHint('');
        }, 2800);
        return;
      }

      await navigator.clipboard.writeText(url);
      setState('copied');
      play('success');
      window.setTimeout(() => setState('idle'), 2200);
    } catch {
      setHint('Copie impossible — vérifiez les permissions du navigateur.');
      setState('error');
      play('error');
      window.setTimeout(() => {
        setState('idle');
        setHint('');
      }, 2800);
    }
  }, [company, play]);

  const label =
    hint ||
    (state === 'copied'
      ? 'Lien portail copié'
      : state === 'error'
        ? 'Erreur'
        : 'Copier le lien portail client');

  const iconClass = 'h-4 w-4';
  let icon = <Link2 className={iconClass} aria-hidden />;
  if (state === 'loading') icon = <Loader2 className={`${iconClass} animate-spin`} aria-hidden />;
  else if (state === 'copied') icon = <Check className={iconClass} aria-hidden />;
  else if (state === 'error') icon = <AlertCircle className={iconClass} aria-hidden />;

  const tone =
    state === 'copied'
      ? 'text-green-600 bg-green-50 border-green-200 hover:bg-green-50'
      : state === 'error'
        ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-50'
        : 'text-gray-500 bg-white border-gray-200 hover:text-[#1B2A4A] hover:border-blue-200 hover:bg-blue-50/60';

  return (
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        onClick={() => void copyLink()}
        disabled={state === 'loading'}
        title={label}
        aria-label={label}
        className={`inline-flex items-center justify-center rounded-lg border p-2 transition-colors disabled:opacity-60 ${tone} ${className}`}
      >
        {icon}
      </button>
      {state === 'copied' && (
        <span className="absolute -bottom-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
          Copié !
        </span>
      )}
    </div>
  );
}

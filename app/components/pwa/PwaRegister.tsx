'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Registers the PWA service worker and surfaces a discreet install CTA on mobile.
 */
export function PwaRegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[pwa] service worker registration failed', err);
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    try {
      if (sessionStorage.getItem('zafirix-pwa-install-dismissed') === '1') {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    setDeferred(null);
    try {
      sessionStorage.setItem('zafirix-pwa-install-dismissed', '1');
    } catch {
      /* ignore */
    }
  };

  if (!deferred || dismissed) return null;

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[60] lg:hidden">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#0F1F3D] text-white shadow-xl px-4 py-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Installer ZAFIRIX PRO</p>
          <p className="text-[11px] text-white/60 truncate">Accès rapide comme une application native</p>
        </div>
        <button
          type="button"
          onClick={() => void install()}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 text-[#0F1F3D] px-3 py-2 text-xs font-bold min-h-11"
        >
          <Download size={14} /> Installer
        </button>
        <button type="button" onClick={dismiss} className="p-2 text-white/50 hover:text-white min-h-11 min-w-11" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

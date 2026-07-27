'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { fetchSessionProfileStatus } from '@/app/lib/atlas-profile-status-client';
import { isActiveStatus } from '@/app/types/auth';
import { supabase } from '@/app/lib/supabase';

const POLL_INTERVAL_MS = 5000;

export default function PendingApprovalPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const redirectingRef = useRef(false);

  const checkAccess = useCallback(async (): Promise<void> => {
    if (redirectingRef.current) return;

    if (!isAtlasSupabaseDataEnabled()) {
      redirectingRef.current = true;
      router.replace('/landing');
      return;
    }

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.user?.id) {
        redirectingRef.current = true;
        router.replace('/login?next=/pending-approval');
        return;
      }

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('[pending-approval] refreshSession failed:', refreshError.message);
      }

      const { status, source, error: statusError } = await fetchSessionProfileStatus();
      if (statusError) {
        console.warn('[pending-approval] status fetch failed:', statusError, 'source:', source);
      }

      if (isActiveStatus(status)) {
        redirectingRef.current = true;
        router.replace('/');
        return;
      }

      setReady(true);
    } catch (err) {
      console.error('[pending-approval] checkAccess error:', err);
      setReady(true);
    }
  }, [router]);

  useEffect(() => {
    void checkAccess();

    const intervalId = window.setInterval(() => {
      void checkAccess();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [checkAccess]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-500">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
        <h1 className="text-xl font-extrabold text-gray-900">En attente d&apos;approbation</h1>
        <p className="text-sm text-gray-600 mt-2">
          Votre compte est en attente d&apos;approbation. L&apos;administrateur doit valider votre accès.
        </p>
        <p className="text-xs text-gray-500 mt-4">
          Vérification automatique toutes les {POLL_INTERVAL_MS / 1000} secondes via le serveur. Redirection
          immédiate dès activation.
        </p>
        <button
          type="button"
          onClick={() => router.push('/login?next=/')}
          className="mt-5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50"
        >
          Se reconnecter
        </button>
      </div>
    </div>
  );
}

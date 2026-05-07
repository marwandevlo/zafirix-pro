'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';

export default function PendingApprovalPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (!isAtlasSupabaseDataEnabled()) {
        router.push('/landing');
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user?.id) {
        router.push('/login?next=/pending-approval');
        return;
      }
      if (!cancelled) setReady(true);
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
        <h1 className="text-xl font-extrabold text-gray-900">En attente d’approbation</h1>
        <p className="text-sm text-gray-600 mt-2">
          Votre compte est en attente d’approbation. L’administrateur doit valider votre accès.
        </p>
      </div>
    </div>
  );
}


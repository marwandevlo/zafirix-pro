'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Phone, User } from 'lucide-react';
import { ZafirixLogo } from '@/app/components/branding/ZafirixLogo';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { fetchProfileViaApi, patchProfileViaApi } from '@/app/lib/atlas-profile-api-client';
import { trackOnboardingStarted } from '@/app/lib/atlas-onboarding-analytics';
import { supabase } from '@/app/lib/supabase';

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');

  const canSubmit = useMemo(() => fullName.trim().length > 0, [fullName]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!isAtlasSupabaseDataEnabled()) {
        router.push('/');
        return;
      }

      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user?.id) {
        router.push('/login?next=/onboarding');
        return;
      }

      const token = session.access_token ?? '';
      const profile = await fetchProfileViaApi(token, {
        userId: session.user.id,
        email: session.user.email ?? '',
      });

      if (cancelled) return;

      const existingName = profile.full_name.trim();
      if (existingName) {
        router.push('/');
        return;
      }

      setFullName(existingName);
      setPhone(profile.phone.trim());
      setCompany(profile.company_name.trim());
      setLoading(false);
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const submit = async () => {
    setError('');
    if (!canSubmit) {
      setError('Nom complet requis.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const user = session?.user;
      if (!user?.id) {
        router.push('/login?next=/onboarding');
        return;
      }

      const token = session?.access_token ?? '';
      const result = await patchProfileViaApi(token, {
        full_name: fullName.trim(),
        company_name: company.trim() || '',
        phone: phone.trim() || null,
      });

      if (!result.ok) {
        setError('Enregistrement impossible. Réessayez.');
        return;
      }

      trackOnboardingStarted('profile_onboarding');
      router.push('/setup');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="text-sm text-slate-500">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 to-white flex flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-center">
          <ZafirixLogo size="sm" subtitle subtitleText="ZAFIRIX PRO" subtitleClassName="text-slate-400" />
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-8 sm:py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h1 className="text-xl font-extrabold text-slate-900">Finalisez votre profil</h1>
          <p className="text-sm text-slate-500 mt-1">Nom complet requis. Le reste est optionnel.</p>

          {error ? (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Nom complet *</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  placeholder="Prénom et nom"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Téléphone (optionnel)</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  placeholder="+212…"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Société (optionnel)</label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  placeholder="Nom de la société"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="w-full py-3.5 rounded-2xl bg-[#0f1a32] text-white font-bold text-sm hover:bg-[#1a2a4a] transition-colors disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Continuer'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

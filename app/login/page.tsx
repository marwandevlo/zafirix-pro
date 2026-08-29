'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PublicFooter } from '@/app/components/public/PublicFooter';
import { ZafirixLogo } from '@/app/components/branding/ZafirixLogo';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { claimAtlasFreeTrialAfterAuth, shouldPersistAtlasTrialNotice } from '@/app/lib/atlas-trial-claim-client';
import {
  awaitCompleteReferralSignupWithSession,
  captureReferralFromWindow,
  logReferralLandingClick,
} from '@/app/lib/atlas-referral-client';
import { resolvePostAuthRoute } from '@/app/lib/atlas-auth-routing';
import { fetchSessionProfileStatus } from '@/app/lib/atlas-profile-status-client';

async function runPostLoginLifecycle(params: {
  email: string;
  password: string;
}): Promise<{ ok: true; route: string } | { ok: false; error: string }> {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (signInError) {
    return { ok: false, error: 'Email ou mot de passe incorrect' };
  }

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn('[login] refreshSession failed:', refreshError.message);
  }

  if (isAtlasSupabaseDataEnabled()) {
    const claim = await claimAtlasFreeTrialAfterAuth();
    await awaitCompleteReferralSignupWithSession();
    if (typeof window !== 'undefined' && shouldPersistAtlasTrialNotice(claim)) {
      sessionStorage.setItem('zafirix_trial_notice', claim.message ?? '');
    }
  }

  const { status: profileStatus, source, error: statusError } = await fetchSessionProfileStatus();
  if (statusError) {
    console.warn('[login] profile status fetch:', statusError, 'source:', source);
  }

  const nextParam =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next')?.trim() : '';

  return { ok: true, route: resolvePostAuthRoute(profileStatus, nextParam) };
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    const code = captureReferralFromWindow();
    if (code) logReferralLandingClick(code);
    if (!isAtlasSupabaseDataEnabled()) return;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await awaitCompleteReferralSignupWithSession();
    })();
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    if (mode === 'register') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window !== 'undefined'
              ? `${window.location.origin}/auth/callback?next=/dashboard`
              : undefined,
        },
      });
      if (error) setError(error.message);
      else {
        if (isAtlasSupabaseDataEnabled() && data.session) {
          const claim = await claimAtlasFreeTrialAfterAuth();
          await awaitCompleteReferralSignupWithSession();
          if (typeof window !== 'undefined' && shouldPersistAtlasTrialNotice(claim)) {
            sessionStorage.setItem('zafirix_trial_notice', claim.message ?? '');
          }
          const access = data.session.access_token;
          if (access) {
            void fetch('/api/email/welcome', {
              method: 'POST',
              headers: { Authorization: `Bearer ${access}` },
            }).catch((error: unknown) => {
              console.warn('[login] welcome email failed', error instanceof Error ? error.message : error);
            });
          }
        }
        setSuccess('Compte créé ! Vérifiez votre e-mail si une confirmation est requise, puis connectez-vous pour activer l’essai selon l’éligibilité.');
      }
    } else {
      try {
        const result = await runPostLoginLifecycle({ email, password });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(result.route);
      } catch (err) {
        console.error('[login] unexpected error:', err);
        setError('Connexion impossible. Réessayez.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#1B2A4A] flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-amber-400 rounded-xl flex items-center justify-center">
            <Building2 size={28} className="text-[#1B2A4A]" />
          </div>
          <ZafirixLogo size="md" subtitle subtitleText="ZAFIRIX GROUP · Maroc" subtitleClassName="text-white/40" className="flex justify-center" />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h1 className="text-xl font-bold text-gray-800 mb-1">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            {mode === 'login' ? 'Accédez à votre espace ZAFIRIX PRO' : 'Commencez votre essai gratuit'}
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">
              {success}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  placeholder="votre@email.com"
                  className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Mot de passe</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => router.push('/forgot-password')}
                  className="text-xs font-semibold text-blue-500 hover:text-blue-700"
                >
                  Mot de passe oublié ? / نسيت كلمة المرور؟
                </button>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#243660] transition-colors disabled:opacity-50"
            >
              {loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }}
              className="text-sm text-blue-500 hover:text-blue-700">
              {mode === 'login' ? "Pas de compte? S'inscrire" : 'Déjà un compte? Se connecter'}
            </button>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <span className="text-white/30 text-xs">Conforme DGI Maroc</span>
          <span className="text-white/20">·</span>
          <span className="text-white/30 text-xs">SSL Sécurisé</span>
          <span className="text-white/20">·</span>
          <span className="text-white/30 text-xs">RGPD</span>
        </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
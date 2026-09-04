'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, Eye, EyeOff, Lock } from 'lucide-react';
import Image from 'next/image';
import { supabase } from '@/app/lib/supabase';
import { PublicFooter } from '@/app/components/public/PublicFooter';

const MIN_PASSWORD_LEN = 8;

function stripAuthFromBrowserUrl() {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  u.hash = '';
  u.searchParams.delete('code');
  const q = u.searchParams.toString();
  const path = u.pathname + (q ? `?${q}` : '');
  window.history.replaceState({}, document.title, path);
}

function getHashSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  const h = window.location.hash || '';
  const raw = h.startsWith('#') ? h.slice(1) : h;
  return new URLSearchParams(raw);
}

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const [bootPhase, setBootPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootMessage, setBootMessage] = useState('');
  const mayUpdatePassword = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearBootTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const ready = () => {
      if (cancelled || mayUpdatePassword.current) return;
      mayUpdatePassword.current = true;
      clearBootTimeout();
      setBootPhase('ready');
      stripAuthFromBrowserUrl();
    };

    const fail = (msg: string) => {
      if (cancelled) return;
      mayUpdatePassword.current = false;
      setBootPhase('error');
      setBootMessage(msg);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') {
        ready();
      }
    });
    unsubscribe = () => sub.subscription.unsubscribe();

    void (async () => {
      const code = searchParams.get('code');
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exErr) {
          fail(
            'Lien invalide ou expiré. Demandez un nouveau lien depuis la page mot de passe oublié.',
          );
          return;
        }
        ready();
        return;
      }

      const hp = getHashSearchParams();
      const access = hp.get('access_token');
      const refresh = hp.get('refresh_token');
      const typ = hp.get('type');
      if (access && refresh && typ === 'recovery') {
        const { error: sErr } = await supabase.auth.setSession({
          access_token: access,
          refresh_token: refresh,
        });
        if (cancelled) return;
        if (sErr) {
          fail(
            'Lien invalide ou expiré. Demandez un nouveau lien depuis la page mot de passe oublié.',
          );
          return;
        }
        ready();
        return;
      }

      timeoutId = setTimeout(() => {
        if (cancelled) return;
        if (mayUpdatePassword.current) return;
        fail(
          'Lien invalide ou expiré. Demandez un nouveau lien depuis la page mot de passe oublié.',
        );
        unsubscribe?.();
        unsubscribe = null;
      }, 5000);
    })();

    return () => {
      cancelled = true;
      clearBootTimeout();
      unsubscribe?.();
    };
  }, [searchParams]);

  const validation = useMemo(() => {
    if (!password) return { ok: false, msg: '' };
    if (password.length < MIN_PASSWORD_LEN) {
      return {
        ok: false,
        msg: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LEN} caractères.`,
      };
    }
    if (password !== confirm) return { ok: false, msg: 'Les mots de passe ne correspondent pas.' };
    return { ok: true, msg: '' };
  }, [confirm, password]);

  const submit = async () => {
    setError('');
    if (bootPhase !== 'ready' || !mayUpdatePassword.current) {
      setError('Session de récupération introuvable. Rouvrez le lien reçu par e-mail.');
      return;
    }
    if (!validation.ok) {
      setError(validation.msg || 'Erreur.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setError(
          'Lien invalide ou expiré. Demandez un nouveau lien depuis la page mot de passe oublié.',
        );
        return;
      }

      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) {
        setError('Impossible de mettre à jour le mot de passe. Réessayez.');
        return;
      }

      const token = data.session.access_token;
      void fetch('/api/auth/notify-security', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ kind: 'password_changed' }),
        cache: 'no-store',
      }).catch(() => {});

      await supabase.auth.signOut();
      setDone(true);
      setTimeout(() => router.push('/login'), 900);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1B2A4A] flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm"
            >
              <ArrowLeft size={16} /> Retour
            </button>
            <Image
              src="/zafirix-logo.png"
              alt="ZAFIRIX PRO"
              width={140}
              height={40}
              className="h-8 w-auto"
              priority
            />
            <div />
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h1 className="text-xl font-bold text-gray-800 mb-1">إعادة تعيين كلمة المرور</h1>
            <p className="text-sm text-gray-500">Choisissez un nouveau mot de passe.</p>

            {bootPhase === 'loading' && (
              <div className="mt-6 text-sm text-gray-500">Vérification du lien sécurisé…</div>
            )}

            {bootPhase === 'error' && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {bootMessage}
              </div>
            )}

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {done ? (
              <div className="mt-6 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                <CheckCircle size={16} className="mt-0.5" />
                <div>
                  <p className="font-semibold">تم تحديث كلمة المرور بنجاح</p>
                  <p className="mt-0.5">سيتم تحويلك إلى صفحة الدخول…</p>
                </div>
              </div>
            ) : bootPhase === 'ready' ? (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Nouveau mot de passe</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={show ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-10 py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Minimum {MIN_PASSWORD_LEN} caractères.</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Confirmer</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      type={show ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={submit}
                  disabled={loading}
                  className="w-full py-3 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#243660] transition-colors disabled:opacity-50"
                >
                  {loading ? 'Chargement…' : 'Mettre à jour'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}

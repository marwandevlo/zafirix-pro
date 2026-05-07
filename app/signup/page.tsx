'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Mail, Lock, Eye, EyeOff, User, Phone, Building, MapPin, BadgeCheck, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { addDaysYmd, todayYmd } from '@/app/lib/atlas-dates';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import type { AtlasCompany } from '@/app/types/atlas-company';
import { readCompaniesFromLocalStorage, writeCompaniesToLocalStorage } from '@/app/lib/atlas-companies-repository';
import { PublicFooter } from '@/app/components/public/PublicFooter';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { claimAtlasFreeTrialAfterAuth, shouldPersistAtlasTrialNotice } from '@/app/lib/atlas-trial-claim-client';
import { awaitCompleteReferralSignupWithSession, storePendingReferralCode } from '@/app/lib/atlas-referral-client';
import { normalizeReferralCode } from '@/app/lib/atlas-referral-utils';
import { trackEvent } from '@/app/lib/analytics-track';
import { getUsage, setUsage } from '@/app/lib/atlas-usage-limits';
import { ZafirixLogo } from '@/app/components/branding/ZafirixLogo';
import { isOwnerEmail } from '@/app/lib/owner';

type UserProfile = {
  fullName: string;
  email: string;
  phone: string;
  company: {
    name: string;
    type: string;
    city: string;
    ice?: string;
    companiesManaged?: number;
    usersNeeded?: number;
  };
  createdAt: string;
};

type ActiveSubscription = {
  id: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  status: 'trial';
  paymentReference: string;
  createdAt: string;
};

const STORAGE = {
  userProfile: 'atlas_user_profile',
} as const;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').trim();
}

function isValidPhone(phone: string): boolean {
  const p = normalizePhone(phone);
  // simple: accept +212XXXXXXXXX or 0XXXXXXXXX, 9-15 digits
  return /^(\+?\d{9,15}|0\d{8,14})$/.test(p);
}

export default function SignUpPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState('SARL');
  const [city, setCity] = useState('Casablanca');
  const [ice, setIce] = useState('');
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);

  const [acceptTerms, setAcceptTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get('ref');
      const code = normalizeReferralCode(raw);
      if (!code) return;
      storePendingReferralCode(code);
      if (sessionStorage.getItem('atlas_ref_signup_started') === '1') return;
      sessionStorage.setItem('atlas_ref_signup_started', '1');
      trackEvent('referral_signup_started', { referral_code: code });
      void fetch('/api/referral/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        keepalive: true,
      });
    } catch {
      // ignore
    }
  }, []);

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (!fullName.trim()) errs.push('Nom complet requis.');
    if (!email.trim() || !isValidEmail(email)) errs.push('Email invalide.');
    if (phone.trim() && !isValidPhone(phone)) errs.push('Numéro de téléphone invalide.');
    if (!password) errs.push('Mot de passe requis.');
    if (password !== confirmPassword) errs.push('La confirmation du mot de passe ne correspond pas.');
    if (!acceptTerms) errs.push('Vous devez accepter les Conditions et la Politique de confidentialité.');
    return { ok: errs.length === 0, errs };
  }, [acceptTerms, confirmPassword, email, fullName, password, phone]);

  const createCompanyProfile = () => {
    const displayName = companyName.trim() || `Société de ${fullName.trim() || 'Mon entreprise'}`;
    const nextCompany: AtlasCompany = {
      id: Date.now(),
      raisonSociale: displayName,
      formeJuridique: companyType,
      if_fiscal: '',
      ice: ice.trim(),
      rc: '',
      cnss: '',
      adresse: '',
      ville: city,
      telephone: normalizePhone(phone) || '',
      email: email.trim(),
      activite: '',
      regimeTVA: 'mensuel',
      actif: true,
      balance: 0,
      paymentTerms: { kind: 'preset', days: 30 },
    };

    const existing = readCompaniesFromLocalStorage();
    const deactivated = existing.map((c) => ({ ...c, actif: false }));
    const updated = [nextCompany, ...deactivated];
    writeCompaniesToLocalStorage(updated);
    localStorage.setItem(ATLAS_STORAGE_KEYS.activeCompany, JSON.stringify(nextCompany));
  };

  const assignFreeTrial = () => {
    const start = todayYmd();
    const end = addDaysYmd(start, 7);
    const order: ActiveSubscription = {
      id: `trial_${Date.now()}`,
      planId: 'free-trial',
      planName: 'Free Trial',
      startDate: start,
      endDate: end,
      status: 'trial',
      paymentReference: 'signup',
      createdAt: new Date().toISOString(),
    };
    void order;
  };

  const storeUserProfile = () => {
    const coName = companyName.trim() || `Société de ${fullName.trim() || 'Mon entreprise'}`;
    const profile: UserProfile = {
      fullName: fullName.trim(),
      email: email.trim(),
      phone: normalizePhone(phone),
      company: {
        name: coName,
        type: companyType,
        city,
        ...(ice.trim() ? { ice: ice.trim() } : {}),
        companiesManaged: 1,
        usersNeeded: 1,
      },
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE.userProfile, JSON.stringify(profile));
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    if (!validation.ok) {
      setError(validation.errs[0] || 'Erreur de validation.');
      return;
    }

    setLoading(true);
    try {
      // Do not break existing auth logic: keep Supabase signup.
      const trimmedEmail = email.trim();
      const trimmedFullName = fullName.trim();
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });
      if (error) {
        const msg = String(error.message ?? '');
        const lower = msg.toLowerCase();
        if (lower.includes('already registered') || lower.includes('already exists')) {
          setError('Cet e-mail est déjà utilisé. Connectez-vous ou utilisez un autre e-mail.');
        } else if (lower.includes('password') && (lower.includes('weak') || lower.includes('at least') || lower.includes('length'))) {
          setError('Mot de passe trop faible. Utilisez au moins 8 caractères.');
        } else {
          setError(msg || 'Erreur inscription.');
        }
        return;
      }

      // Persist profile data (main user source). In Supabase mode, prefer writing `profiles` immediately.
      if (isAtlasSupabaseDataEnabled() && signUpData.session?.user?.id) {
        const u = signUpData.session.user;
        const owner = isOwnerEmail(u.email ?? trimmedEmail);
        const { error: profileErr } = await supabase.from('profiles').upsert(
          {
            id: u.id,
            email: u.email ?? trimmedEmail,
            full_name: trimmedFullName,
            role: owner ? 'owner' : 'user',
            plan: owner ? 'enterprise' : 'free',
            status: owner ? 'active' : 'pending',
          },
          { onConflict: 'id' },
        );
        if (profileErr) {
          // Do not block signup success; user can retry after login if needed.
          console.warn('[signup] profile upsert failed', profileErr.message);
        }
      }

      // Demo/localStorage seeding must never run in production (prevents accidental "Pro" defaults).
      // In Supabase mode, Free Trial is assigned server-side (API + DB) after anti-abuse checks.
      const allowDemoSeed = process.env.NODE_ENV === 'development';
      if (allowDemoSeed && !isAtlasSupabaseDataEnabled()) {
        storeUserProfile();
        createCompanyProfile();
        assignFreeTrial();
        const u = getUsage();
        setUsage({ ...u, companies: 1, invoices: 0 });
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('zafirix_show_onboarding', '1');
      }

      if (isAtlasSupabaseDataEnabled() && signUpData.session) {
        const claim = await claimAtlasFreeTrialAfterAuth();
        await awaitCompleteReferralSignupWithSession();
        if (typeof window !== 'undefined' && shouldPersistAtlasTrialNotice(claim)) {
          sessionStorage.setItem('zafirix_trial_notice', claim.message ?? '');
        }
        const access = signUpData.session.access_token;
        if (access) {
          void fetch('/api/email/welcome', {
            method: 'POST',
            headers: { Authorization: `Bearer ${access}` },
          });
        }
      }

      if (isAtlasSupabaseDataEnabled() && !signUpData.session) {
        trackEvent('signup_completed', { flow: 'email_confirmation_required' });
        setSuccess(
          'Compte créé. Si un e-mail de confirmation est requis, ouvrez le lien puis connectez-vous : l’essai gratuit s’activera ensuite selon l’éligibilité.',
        );
        router.push('/login?next=/onboarding');
        return;
      }

      trackEvent('signup_completed', {
        flow: isAtlasSupabaseDataEnabled() ? 'session' : 'local_demo',
      });
      setSuccess('Compte créé. Redirection…');
      router.push('/onboarding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1">
        <div className="bg-[#0F1F3D] text-white py-12 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-amber-400 rounded-xl flex items-center justify-center">
                <Building2 size={24} className="text-[#0F1F3D]" />
              </div>
              <div>
                <ZafirixLogo size="md" subtitle={false} />
                <p className="text-white/60 text-sm">Conçu pour le Maroc · PME & cabinets</p>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-6">Créez votre compte en 30 secondes</h1>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/95">
                <Sparkles size={14} className="text-amber-300" />
                Essai gratuit
              </span>
              <span className="inline-flex rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 text-xs font-medium text-emerald-100">
                Sans carte bancaire
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 -mt-10 pb-12">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Inscription</p>
                <h2 className="text-lg font-bold text-gray-900 mt-1">Nom, e-mail, mot de passe — le reste est optionnel</h2>
              </div>
              <button type="button" onClick={() => router.push('/login')} className="text-sm font-semibold text-blue-600 hover:text-blue-700 shrink-0">
                Déjà un compte ?
              </button>
            </div>

            {error && (
              <div className="mt-5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-xl">
                {success}
              </div>
            )}

            <div className="mt-7 space-y-5 max-w-xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <User size={16} className="text-gray-400" /> Compte
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nom complet *</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" placeholder="Prénom et nom" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">E-mail professionnel *</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" placeholder="vous@entreprise.ma" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Mot de passe *</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} className="w-full pl-10 pr-10 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" placeholder="8 caractères minimum" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Confirmer *</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type={showConfirmPassword ? 'text' : 'password'} className="w-full pl-10 pr-10 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" placeholder="Répétez le mot de passe" />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowOptionalDetails((v) => !v)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span>Téléphone, raison sociale, ICE… (optionnel)</span>
                {showOptionalDetails ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
              </button>

              {showOptionalDetails && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Building size={16} className="text-gray-400" /> Société & contact
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Téléphone</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" placeholder="+212…" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Raison sociale</label>
                    <div className="relative">
                      <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" placeholder="Sinon : « Société de [votre nom] » par défaut" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Forme</label>
                      <select value={companyType} onChange={(e) => setCompanyType(e.target.value)} className="w-full px-3 py-3 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400">
                        <option value="SARL">SARL</option>
                        <option value="SA">SA</option>
                        <option value="AUTO-ENTREPRENEUR">Auto-entrepreneur</option>
                        <option value="CABINET">Cabinet</option>
                        <option value="AUTRE">Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Ville</label>
                      <div className="relative">
                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" placeholder="Casablanca" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">ICE (optionnel)</label>
                    <div className="relative">
                      <BadgeCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={ice} onChange={(e) => setIce(e.target.value)} className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" placeholder="001234567000012" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-start gap-3">
              <input checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} type="checkbox" className="mt-1" />
              <p className="text-sm text-gray-600">
                J’accepte les{' '}
                <a className="text-blue-600 hover:underline" href="/terms">Conditions d’utilisation</a> et la{' '}
                <a className="text-blue-600 hover:underline" href="/privacy">Politique de confidentialité</a>.
              </p>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
              <button onClick={() => router.push('/pricing')} className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Voir les tarifs
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={loading}
                className="px-4 py-3 rounded-xl bg-[#0F1F3D] text-white text-sm font-semibold hover:bg-[#1a3060] disabled:opacity-50"
              >
                {loading ? 'Création…' : 'Créer mon compte'}
              </button>
            </div>

            {!validation.ok && (
              <div className="mt-5 text-xs text-gray-400">
                * Champs requis. {validation.errs[0]}
              </div>
            )}
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}


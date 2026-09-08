/**
 * Standalone affiliate portal registration (no SaaS trial / billing setup).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicAppUrl } from '@/app/lib/atlas-app-url';
import { ensureReferralCodeForUser } from '@/app/lib/atlas-referral-server';
import { recordServerAnalyticsEvent } from '@/app/lib/server-analytics-event';

export type RegisterAffiliateInput = {
  fullName: string;
  email: string;
  password: string;
};

export type RegisterAffiliateResult =
  | {
      ok: true;
      userId: string;
      email: string;
      referralCode: string;
      referralLink: string;
      created: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function registerAffiliateAccount(
  admin: SupabaseClient,
  input: RegisterAffiliateInput,
): Promise<RegisterAffiliateResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!fullName || fullName.length < 2) {
    return { ok: false, code: 'full_name_required', message: 'Nom complet requis (2 caractères minimum).' };
  }
  if (!email || !isValidEmail(email)) {
    return { ok: false, code: 'invalid_email', message: 'Adresse email invalide.' };
  }
  if (!password || password.length < 8) {
    return { ok: false, code: 'weak_password', message: 'Mot de passe trop court (8 caractères minimum).' };
  }

  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      account_type: 'affiliate',
    },
    app_metadata: {
      account_type: 'affiliate',
      role: 'affiliate',
    },
  });

  if (createErr || !createdUser.user?.id) {
    const msg = String(createErr?.message ?? 'signup_failed').toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return {
        ok: false,
        code: 'email_exists',
        message: 'Cet e-mail est déjà utilisé. Connectez-vous ou utilisez un autre e-mail.',
      };
    }
    return {
      ok: false,
      code: 'signup_failed',
      message: createErr?.message ?? 'Inscription affilié échouée.',
    };
  }

  const userId = createdUser.user.id;

  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role: 'affiliate',
      plan: 'free',
      status: 'active',
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (profileErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    const constraint = String(profileErr.message ?? '').includes('profiles_role_check')
      ? 'affiliate_role_not_migrated'
      : 'profile_setup_failed';
    return {
      ok: false,
      code: constraint,
      message:
        constraint === 'affiliate_role_not_migrated'
          ? 'Rôle affilié non disponible en base. Appliquez la migration affiliate_portal_role.'
          : 'Configuration du profil affilié échouée.',
    };
  }

  let referralCode = '';
  let codeCreated = false;
  try {
    const codeResult = await ensureReferralCodeForUser(admin, userId);
    referralCode = codeResult.code;
    codeCreated = codeResult.created;
  } catch {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return {
      ok: false,
      code: 'referral_code_failed',
      message: 'Impossible de générer votre code de parrainage. Réessayez.',
    };
  }

  void recordServerAnalyticsEvent(admin, {
    userId,
    eventName: 'affiliate_portal_signup',
    path: '/api/affiliate/register',
    metadata: { referral_code: referralCode, code_created: codeCreated },
  });

  const origin = getPublicAppUrl();
  return {
    ok: true,
    userId,
    email,
    referralCode,
    referralLink: `${origin}/?ref=${encodeURIComponent(referralCode)}`,
    created: true,
  };
}

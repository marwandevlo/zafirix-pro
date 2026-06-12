/**
 * Sprint B — profile normalization, validation, and billing drift detection.
 */

import {
  ATLAS_PROFILE_PLANS,
  ATLAS_PROFILE_ROLES,
  ATLAS_PROFILE_STATUSES,
  type AtlasProfilePlan,
  type AtlasProfileRole,
  type AtlasProfileStatus,
} from '@/app/lib/admin/atlas-admin-profile-fields';

function expectedProfilePlanFromAtlasPlanId(planId: string): AtlasProfilePlan {
  const id = planId.trim().toLowerCase();
  if (id === 'free-trial') return 'free';
  if (id === 'enterprise') return 'enterprise';
  if (id === 'business' || id === 'advanced') return 'vip';
  return 'pro';
}

export function normalizeProfileRole(raw: string | null | undefined): AtlasProfileRole {
  const r = String(raw ?? '').trim().toLowerCase();
  if ((ATLAS_PROFILE_ROLES as readonly string[]).includes(r)) return r as AtlasProfileRole;
  return 'user';
}

export function normalizeProfilePlan(raw: string | null | undefined): AtlasProfilePlan {
  const p = String(raw ?? '').trim().toLowerCase();
  if ((ATLAS_PROFILE_PLANS as readonly string[]).includes(p)) return p as AtlasProfilePlan;
  return 'free';
}

export function normalizeProfileStatus(raw: string | null | undefined): AtlasProfileStatus {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'approved') return 'active'; // legacy value some DBs still store
  if ((ATLAS_PROFILE_STATUSES as readonly string[]).includes(s)) return s as AtlasProfileStatus;
  return 'pending';
}

export function isProfileSuspended(status: string | null | undefined): boolean {
  return normalizeProfileStatus(status) === 'suspended';
}

/** True when profiles.plan cache disagrees with atlas_subscriptions-derived bucket. */
export function detectProfilePlanDrift(
  profilePlan: string | null | undefined,
  effectiveAtlasPlanId: string | null | undefined,
): boolean {
  const cached = normalizeProfilePlan(profilePlan);
  const expected = expectedProfilePlanFromAtlasPlanId(String(effectiveAtlasPlanId ?? 'free-trial'));
  return cached !== expected;
}

export function profileGuardErrorMessage(code: string): string {
  switch (code) {
    case 'auth_required':
      return 'Connectez-vous pour accéder à votre profil.';
    case 'profile_not_found':
      return 'Profil introuvable. Reconnectez-vous ou contactez le support.';
    case 'invalid_full_name':
      return 'Le nom complet est invalide.';
    case 'invalid_company_name':
      return 'Le nom de société est invalide.';
    default:
      return code || 'Erreur profil.';
  }
}

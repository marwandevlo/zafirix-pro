/**
 * Sprint B — client-side profile access (`public.profiles`).
 * Privileged fields (role, plan, status) are server-managed; users patch identity + onboarding only.
 */

import type { AtlasProfile, AtlasProfileUserPatch } from '@/app/types/atlas-profile';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import {
  normalizeProfilePlan,
  normalizeProfileRole,
  normalizeProfileStatus,
  profileGuardErrorMessage,
} from '@/app/lib/atlas-profile-guards';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { supabase } from '@/app/lib/supabase';

const PROFILE_SELECT =
  'id, email, role, plan, status, full_name, company_name, onboarding_completed, created_at, updated_at';

type ProfileRow = {
  id: string;
  email?: string | null;
  role?: string | null;
  plan?: string | null;
  status?: string | null;
  full_name?: string | null;
  company_name?: string | null;
  onboarding_completed?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function rowToProfile(row: ProfileRow, fallbackEmail = ''): AtlasProfile {
  return {
    id: row.id,
    email: String(row.email ?? fallbackEmail).trim(),
    role: normalizeProfileRole(row.role),
    plan: normalizeProfilePlan(row.plan),
    status: normalizeProfileStatus(row.status),
    full_name: String(row.full_name ?? '').trim(),
    company_name: String(row.company_name ?? '').trim(),
    onboarding_completed: Boolean(row.onboarding_completed),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function validateUserPatch(patch: AtlasProfileUserPatch): { ok: true } | { ok: false; error: string } {
  if (patch.full_name !== undefined) {
    const name = patch.full_name.trim();
    if (name.length > 120) return { ok: false, error: 'invalid_full_name' };
  }
  if (patch.company_name !== undefined) {
    const name = patch.company_name.trim();
    if (name.length > 200) return { ok: false, error: 'invalid_company_name' };
  }
  return { ok: true };
}

/** Ensures a profile row exists for the signed-in user (recovery path). */
export async function ensureAtlasProfileRow(): Promise<{ ok: true; profile: AtlasProfile } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: false, error: 'not_enabled' };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? '';
  const meta = userData.user?.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === 'string' ? meta.full_name : typeof meta?.name === 'string' ? meta.name : '';

  const { data: existing, error: readErr } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', auth.userId)
    .maybeSingle();

  if (readErr) {
    logAtlasServerEvent('profiles', 'error', 'ensure_read_failed', { message: readErr.message });
    return { ok: false, error: readErr.message };
  }

  if (existing) {
    return { ok: true, profile: rowToProfile(existing as ProfileRow, email) };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('profiles')
    .insert({
      id: auth.userId,
      email,
      full_name: fullName,
      company_name: '',
      onboarding_completed: false,
    })
    .select(PROFILE_SELECT)
    .single();

  if (insErr || !inserted) {
    logAtlasServerEvent('profiles', 'error', 'ensure_insert_failed', { message: insErr?.message ?? 'insert_failed' });
    return { ok: false, error: insErr?.message ?? 'profile_not_found' };
  }

  return { ok: true, profile: rowToProfile(inserted as ProfileRow, email) };
}

export async function getAtlasProfile(): Promise<AtlasProfile | null> {
  if (!isAtlasSupabaseDataEnabled()) return null;

  const ensured = await ensureAtlasProfileRow();
  if (!ensured.ok) return null;
  return ensured.profile;
}

export async function patchAtlasProfile(
  patch: AtlasProfileUserPatch,
): Promise<{ ok: true; profile: AtlasProfile } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: false, error: 'not_enabled' };
  }

  const valid = validateUserPatch(patch);
  if (!valid.ok) return valid;

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.full_name !== undefined) payload.full_name = patch.full_name.trim();
  if (patch.company_name !== undefined) payload.company_name = patch.company_name.trim();
  if (patch.onboarding_completed !== undefined) payload.onboarding_completed = patch.onboarding_completed;

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', auth.userId)
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    const ensured = await ensureAtlasProfileRow();
    if (!ensured.ok) return ensured;
    return patchAtlasProfile(patch);
  }

  const { data: userData } = await supabase.auth.getUser();
  return { ok: true, profile: rowToProfile(data as ProfileRow, userData.user?.email ?? '') };
}

export async function completeAtlasOnboarding(): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await patchAtlasProfile({ onboarding_completed: true });
  if (!res.ok) return res;
  return { ok: true };
}

export { profileGuardErrorMessage };

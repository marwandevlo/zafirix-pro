/**
 * Browser helpers for `/api/profile` (service-role ensure + patch on the server).
 */

import type { AtlasProfile, AtlasProfileUserPatch } from '@/app/types/atlas-profile';

export type ProfileApiResult<T> =
  | { ok: true; profile: T; source: 'api' | 'fallback' }
  | { ok: false; error: string };

function defaultProfile(userId: string, email: string): AtlasProfile {
  const now = new Date().toISOString();
  return {
    id: userId,
    email: email.trim(),
    role: 'user',
    plan: 'free',
    status: 'pending',
    full_name: '',
    company_name: '',
    phone: '',
    onboarding_completed: false,
    created_at: now,
    updated_at: now,
  };
}

async function readProfileResponse(res: Response): Promise<AtlasProfile | null> {
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { profile?: AtlasProfile };
  if (!json.profile?.id) return null;
  return json.profile;
}

/** Load profile via API; falls back to a blank profile for the signed-in user. */
export async function fetchProfileViaApi(
  accessToken: string,
  fallback: { userId: string; email: string },
): Promise<AtlasProfile> {
  try {
    const res = await fetch('/api/profile', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const profile = await readProfileResponse(res);
    if (profile) return profile;

    console.warn('[fetchProfileViaApi] API unavailable, using default profile');
    return defaultProfile(fallback.userId, fallback.email);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[fetchProfileViaApi] request failed:', message);
    return defaultProfile(fallback.userId, fallback.email);
  }
}

/** Patch profile via API (server ensures row exists before update). */
export async function patchProfileViaApi(
  accessToken: string,
  patch: AtlasProfileUserPatch,
): Promise<ProfileApiResult<AtlasProfile>> {
  try {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(patch),
    });

    const json = (await res.json().catch(() => ({}))) as {
      profile?: AtlasProfile;
      error?: string;
      message?: string;
    };

    if (res.ok && json.profile?.id) {
      return { ok: true, profile: json.profile, source: 'api' };
    }

    return { ok: false, error: json.message ?? json.error ?? `http_${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

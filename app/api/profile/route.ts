import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import {
  normalizeProfilePlan,
  normalizeProfileRole,
  normalizeProfileStatus,
  profileGuardErrorMessage,
} from '@/app/lib/atlas-profile-guards';
import type { AtlasProfile, AtlasProfileUserPatch } from '@/app/types/atlas-profile';

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

async function ensureProfile(admin: { from: (table: string) => any }, userId: string, email: string, fullName: string) {
  const db = admin as any;
  const { data: existing } = await db.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle();
  if (existing) return rowToProfile(existing as ProfileRow, email);

  const { data: inserted, error } = await db
    .from('profiles')
    .insert({
      id: userId,
      email,
      full_name: fullName,
      company_name: '',
      onboarding_completed: false,
    })
    .select(PROFILE_SELECT)
    .single();

  if (error || !inserted) return null;
  return rowToProfile(inserted as ProfileRow, email);
}

function validatePatch(body: AtlasProfileUserPatch): { ok: true } | { ok: false; error: string } {
  if (body.full_name !== undefined && body.full_name.trim().length > 120) {
    return { ok: false, error: 'invalid_full_name' };
  }
  if (body.company_name !== undefined && body.company_name.trim().length > 200) {
    return { ok: false, error: 'invalid_company_name' };
  }
  return { ok: true };
}

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.code }, { status: session.status });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'misconfigured' }, { status: 503 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authUser } = await admin.auth.admin.getUserById(session.userId);
  const email = authUser.user?.email ?? '';
  const meta = authUser.user?.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === 'string' ? meta.full_name : typeof meta?.name === 'string' ? meta.name : '';

  const profile = await ensureProfile(admin, session.userId, email, fullName);
  if (!profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });
  }

  return NextResponse.json({ profile });
}

export async function PATCH(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.code }, { status: session.status });
  }

  const body = (await request.json().catch(() => ({}))) as AtlasProfileUserPatch;
  const valid = validatePatch(body);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error, message: profileGuardErrorMessage(valid.error) }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'misconfigured' }, { status: 503 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.full_name !== undefined) patch.full_name = body.full_name.trim();
  if (body.company_name !== undefined) patch.company_name = body.company_name.trim();
  if (body.onboarding_completed !== undefined) patch.onboarding_completed = body.onboarding_completed;

  const { data: authUser } = await admin.auth.admin.getUserById(session.userId);
  const email = authUser.user?.email ?? '';

  await ensureProfile(admin, session.userId, email, String(patch.full_name ?? ''));

  const { data, error } = await (admin as any)
    .from('profiles')
    .update(patch)
    .eq('id', session.userId)
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });
  }

  return NextResponse.json({ profile: rowToProfile(data as ProfileRow, email) });
}

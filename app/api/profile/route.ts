import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import {
  normalizeProfilePlan,
  normalizeProfileRole,
  profileGuardErrorMessage,
} from '@/app/lib/atlas-profile-guards';
import { normalizeStatus, type ProfileStatus } from '@/app/types/auth';
import type { AtlasProfile, AtlasProfileUserPatch } from '@/app/types/atlas-profile';

export const dynamic = 'force-dynamic';

const PROFILE_SELECT =
  'id, email, role, plan, status, full_name, company_name, onboarding_completed, created_at, updated_at';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

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

function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
}

function createServiceRoleClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowToProfile(row: ProfileRow, fallbackEmail = ''): AtlasProfile {
  const status: ProfileStatus = normalizeStatus(row.status);
  return {
    id: row.id,
    email: String(row.email ?? fallbackEmail).trim(),
    role: normalizeProfileRole(row.role),
    plan: normalizeProfilePlan(row.plan),
    status,
    full_name: String(row.full_name ?? '').trim(),
    company_name: String(row.company_name ?? '').trim(),
    onboarding_completed: Boolean(row.onboarding_completed),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

async function ensureProfile(
  admin: SupabaseClient,
  userId: string,
  email: string,
  fullName: string,
): Promise<AtlasProfile | null> {
  const { data: existing, error: readError } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (readError) {
    console.error('[api/profile] ensureProfile read failed:', readError.message);
    return null;
  }

  if (existing) {
    return rowToProfile(existing as ProfileRow, email);
  }

  const { data: inserted, error: insertError } = await admin
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

  if (insertError || !inserted) {
    console.error('[api/profile] ensureProfile insert failed:', insertError?.message ?? 'insert_failed');
    return null;
  }

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
    return NextResponse.json({ error: 'not_enabled' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.code }, { status: session.status, headers: NO_STORE_HEADERS });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    console.error('[api/profile] GET misconfigured: SUPABASE_SERVICE_ROLE_KEY missing');
    return NextResponse.json({ error: 'misconfigured' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(session.userId);
    if (authError) {
      console.error('[api/profile] GET auth.admin.getUserById failed:', authError.message);
      return NextResponse.json({ error: 'auth_lookup_failed' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const email = authUser.user?.email ?? '';
    const meta = authUser.user?.user_metadata as Record<string, unknown> | undefined;
    const fullName =
      typeof meta?.full_name === 'string'
        ? meta.full_name
        : typeof meta?.name === 'string'
          ? meta.name
          : '';

    const profile = await ensureProfile(admin, session.userId, email, fullName);
    if (!profile) {
      return NextResponse.json({ error: 'profile_not_found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ profile }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/profile] GET unexpected error:', message);
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function PATCH(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.code }, { status: session.status, headers: NO_STORE_HEADERS });
  }

  const body = (await request.json().catch(() => ({}))) as AtlasProfileUserPatch;
  const valid = validatePatch(body);
  if (!valid.ok) {
    return NextResponse.json(
      { error: valid.error, message: profileGuardErrorMessage(valid.error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    console.error('[api/profile] PATCH misconfigured: SUPABASE_SERVICE_ROLE_KEY missing');
    return NextResponse.json({ error: 'misconfigured' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.full_name !== undefined) patch.full_name = body.full_name.trim();
    if (body.company_name !== undefined) patch.company_name = body.company_name.trim();
    if (body.onboarding_completed !== undefined) patch.onboarding_completed = body.onboarding_completed;

    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(session.userId);
    if (authError) {
      console.error('[api/profile] PATCH auth lookup failed:', authError.message);
      return NextResponse.json({ error: 'auth_lookup_failed' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const email = authUser.user?.email ?? '';
    await ensureProfile(admin, session.userId, email, String(patch.full_name ?? ''));

    const { data, error } = await admin
      .from('profiles')
      .update(patch)
      .eq('id', session.userId)
      .select(PROFILE_SELECT)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (!data) {
      return NextResponse.json({ error: 'profile_not_found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ profile: rowToProfile(data as ProfileRow, email) }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/profile] PATCH unexpected error:', message);
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

import type { NextRequest } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';

type AuthOk = { ok: true; status: 200; user: { id: string } };
type AuthErrorCode = 'missing_token' | 'invalid_token' | 'server_not_configured' | 'ocr_not_configured';
type AuthErr = { ok: false; status: 401 | 500 | 503; code: AuthErrorCode };

/**
 * Opt-in **only** for local demos. Production must leave this unset/false so `/api/ai`
 * is not a public cost sink.
 */
function allowAnonymousAi(): boolean {
  const v = (process.env.ATLAS_AI_ALLOW_ANON ?? '').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function mapSessionError(code: 'missing_session' | 'invalid_token' | 'misconfigured'): AuthErr {
  if (code === 'misconfigured') return { ok: false, status: 500, code: 'server_not_configured' };
  if (code === 'invalid_token') return { ok: false, status: 401, code: 'invalid_token' };
  return { ok: false, status: 401, code: 'missing_token' };
}

/**
 * Server-side auth for `/api/ai`.
 *
 * - Default: **authenticated** users only (Supabase session cookie or `Authorization: Bearer <access_token>`).
 * - Anonymous: set `ATLAS_AI_ALLOW_ANON=true` (development / isolated demos only).
 *
 * Legacy `ATLAS_AI_REQUIRE_AUTH` is ignored; auth is required unless `ATLAS_AI_ALLOW_ANON` is explicitly enabled.
 */
export async function authenticateAiRequest(request: NextRequest): Promise<AuthOk | AuthErr> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return { ok: false, status: 503, code: 'ocr_not_configured' };
  }

  if (allowAnonymousAi()) {
    return { ok: true, status: 200, user: { id: 'anon' } };
  }

  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return mapSessionError(session.code);
  }

  return { ok: true, status: 200, user: { id: session.userId } };
}

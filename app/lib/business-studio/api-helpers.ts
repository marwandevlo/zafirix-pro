import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { StoreError } from './server-store';

const MAX_BODY_BYTES = 2_500_000;

export type StudioContext = { db: SupabaseClient; userId: string };

/** Authenticates the caller, then maps store errors to JSON responses without leaking internals. */
export async function withStudio(request: NextRequest, fn: (ctx: StudioContext) => Promise<Response>): Promise<Response> {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return NextResponse.json({ error: session.code }, { status: session.status });
  try {
    return await fn({ db: getSupabaseServiceRoleClient(), userId: session.userId });
  } catch (e) {
    if (e instanceof StoreError) return NextResponse.json({ error: e.code, ...e.extra }, { status: e.status });
    console.error('[business-studio]', e instanceof Error ? e.message : 'unknown_error');
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new StoreError(413, 'payload_too_large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new StoreError(413, 'payload_too_large');
  if (!text.trim()) return {};
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new StoreError(400, 'invalid_json');
    return v as Record<string, unknown>;
  } catch (e) {
    if (e instanceof StoreError) throw e;
    throw new StoreError(400, 'invalid_json');
  }
}

export const noStore = { headers: { 'Cache-Control': 'no-store' } };

import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getSupabaseUserClientFromBearer } from '@/app/lib/supabase-admin';
import { logPageView, touchUserPresence } from '@/app/lib/atlas-user-activity';

export const dynamic = 'force-dynamic';

const PUBLIC_PREFIXES = ['/login', '/signup', '/auth', '/access-denied', '/pricing'];

function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: false, error: 'not_enabled' }, { status: 400 });
  }

  const auth = request.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 });
  }

  const userClient = getSupabaseUserClientFromBearer(token);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 });
  }

  let body: { path?: string; logPage?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const path = String(body.path ?? '').trim();
  const shouldLogPage = body.logPage === true && path && !isPublicPath(path);

  await touchUserPresence(data.user.id);
  if (shouldLogPage) {
    void logPageView(data.user.id, path);
  }

  return NextResponse.json({ ok: true, userId: data.user.id });
}

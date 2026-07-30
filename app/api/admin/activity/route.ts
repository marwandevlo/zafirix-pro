import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { getAdminActivityOverview } from '@/app/lib/atlas-user-activity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') {
      return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
    }

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    const limitRaw = Number(url.searchParams.get('limit') ?? '200');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 200;

    const overview = await getAdminActivityOverview({ q, limit });
    return NextResponse.json(overview);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur';
    return NextResponse.json({ error: 'server_error', message }, { status: 500 });
  }
}

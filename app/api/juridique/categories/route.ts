import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { loadJuridiqueCatalog } from '@/app/lib/atlas-juridique-categories-server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({
      ok: true,
      catalog: (await import('@/app/lib/atlas-juridique-categories-server')).DEFAULT_MOROCCAN_JURIDIQUE_CATALOG,
      source: 'defaults',
    });
  }

  const ctx = await requireAgentsRouteDb(_request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const admin = getSupabaseServiceRoleClient();
    const catalog = await loadJuridiqueCatalog(admin);
    return NextResponse.json({ ok: true, catalog: catalog.categories, source: catalog.source });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'catalog_load_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

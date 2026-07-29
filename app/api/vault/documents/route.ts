import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { searchCorporateVault } from '@/app/lib/atlas-corporate-vault';
import type { CorporateVaultFolderId } from '@/app/types/atlas-corporate-vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const folder = request.nextUrl.searchParams.get('folder')?.trim() as CorporateVaultFolderId | undefined;

  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  try {
    const result = await searchCorporateVault(ctx.db, ctx.userId, companyId, query, folder);
    return NextResponse.json({ ok: true, vault: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vault_search_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => ({}))) as {
    documentId?: string;
    vaultFolder?: CorporateVaultFolderId;
    vaultTags?: string[];
  };

  if (!body.documentId) return NextResponse.json({ error: 'document_required' }, { status: 400 });

  try {
    const { tagVaultDocument } = await import('@/app/lib/atlas-corporate-vault');
    await tagVaultDocument(ctx.db, ctx.userId, body.documentId, {
      vaultFolder: body.vaultFolder,
      vaultTags: body.vaultTags,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'tag_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

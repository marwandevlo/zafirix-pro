import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  createJuridiqueCategory,
  createJuridiqueDocumentType,
  deleteJuridiqueCategory,
  deleteJuridiqueDocumentType,
  loadJuridiqueCatalog,
  reorderJuridiqueCategories,
  updateJuridiqueCategory,
  updateJuridiqueDocumentType,
} from '@/app/lib/atlas-juridique-categories-server';
import { logAtlasAdminAction } from '@/app/lib/admin/atlas-admin-audit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const admin = getSupabaseServiceRoleClient();
    const catalog = await loadJuridiqueCatalog(admin, { includeInactive: true });
    return NextResponse.json({ ok: true, catalog: catalog.categories, source: catalog.source });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'catalog_load_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as null | {
    action?: string;
    category?: Record<string, unknown>;
    documentType?: Record<string, unknown>;
    orderedCategoryIds?: string[];
  };

  try {
    const admin = getSupabaseServiceRoleClient();

    if (body?.action === 'reorder' && Array.isArray(body.orderedCategoryIds)) {
      await reorderJuridiqueCategories(admin, body.orderedCategoryIds);
      await logAtlasAdminAction({
        actorUserId: guard.adminUserId,
        action: 'juridique_categories_reorder',
        targetType: 'atlas_juridique_categories',
        metadata: { count: body.orderedCategoryIds.length },
      });
      return NextResponse.json({ ok: true });
    }

    if (body?.action === 'create_document_type' && body.documentType) {
      const dt = body.documentType;
      const created = await createJuridiqueDocumentType(admin, {
        categoryId: String(dt.categoryId ?? ''),
        slug: dt.slug ? String(dt.slug) : undefined,
        labelFr: String(dt.labelFr ?? ''),
        labelAr: String(dt.labelAr ?? ''),
        descriptionFr: dt.descriptionFr ? String(dt.descriptionFr) : undefined,
        descriptionAr: dt.descriptionAr ? String(dt.descriptionAr) : undefined,
        uploadPromptFr: dt.uploadPromptFr ? String(dt.uploadPromptFr) : undefined,
        uploadPromptAr: dt.uploadPromptAr ? String(dt.uploadPromptAr) : undefined,
        isRequired: Boolean(dt.isRequired),
        moroccanRef: dt.moroccanRef ? String(dt.moroccanRef) : undefined,
      });
      await logAtlasAdminAction({
        actorUserId: guard.adminUserId,
        action: 'juridique_document_type_create',
        targetType: 'atlas_juridique_document_types',
        targetId: created.id,
      });
      return NextResponse.json({ ok: true, documentType: created });
    }

    const catInput = body?.category;
    if (!catInput || typeof catInput !== 'object') {
      return NextResponse.json({ error: 'invalid_category' }, { status: 400 });
    }
    const cat = catInput as Record<string, unknown>;
    const created = await createJuridiqueCategory(admin, {
      slug: cat.slug ? String(cat.slug) : undefined,
      labelFr: String(cat.labelFr ?? ''),
      labelAr: String(cat.labelAr ?? ''),
      descriptionFr: cat.descriptionFr ? String(cat.descriptionFr) : undefined,
      descriptionAr: cat.descriptionAr ? String(cat.descriptionAr) : undefined,
      uploadPromptFr: cat.uploadPromptFr ? String(cat.uploadPromptFr) : undefined,
      uploadPromptAr: cat.uploadPromptAr ? String(cat.uploadPromptAr) : undefined,
      icon: cat.icon ? String(cat.icon) : undefined,
      tags: Array.isArray(cat.tags) ? cat.tags.map(String) : undefined,
    });
    await logAtlasAdminAction({
      actorUserId: guard.adminUserId,
      action: 'juridique_category_create',
      targetType: 'atlas_juridique_categories',
      targetId: created.id,
    });
    return NextResponse.json({ ok: true, category: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create_failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as null | {
    categoryId?: string;
    documentTypeId?: string;
    patch?: Record<string, unknown>;
  };

  const patch = body?.patch ?? {};
  try {
    const admin = getSupabaseServiceRoleClient();

    if (body?.documentTypeId) {
      await updateJuridiqueDocumentType(admin, body.documentTypeId, {
        labelFr: patch.labelFr !== undefined ? String(patch.labelFr) : undefined,
        labelAr: patch.labelAr !== undefined ? String(patch.labelAr) : undefined,
        descriptionFr: patch.descriptionFr !== undefined ? (patch.descriptionFr as string | null) : undefined,
        descriptionAr: patch.descriptionAr !== undefined ? (patch.descriptionAr as string | null) : undefined,
        uploadPromptFr: patch.uploadPromptFr !== undefined ? (patch.uploadPromptFr as string | null) : undefined,
        uploadPromptAr: patch.uploadPromptAr !== undefined ? (patch.uploadPromptAr as string | null) : undefined,
        isRequired: patch.isRequired !== undefined ? Boolean(patch.isRequired) : undefined,
        isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : undefined,
        sortOrder: patch.sortOrder !== undefined ? Number(patch.sortOrder) : undefined,
        moroccanRef: patch.moroccanRef !== undefined ? (patch.moroccanRef as string | null) : undefined,
      });
      return NextResponse.json({ ok: true });
    }

    if (!body?.categoryId) {
      return NextResponse.json({ error: 'missing_id' }, { status: 400 });
    }

    await updateJuridiqueCategory(admin, body.categoryId, {
      labelFr: patch.labelFr !== undefined ? String(patch.labelFr) : undefined,
      labelAr: patch.labelAr !== undefined ? String(patch.labelAr) : undefined,
      descriptionFr: patch.descriptionFr !== undefined ? (patch.descriptionFr as string | null) : undefined,
      descriptionAr: patch.descriptionAr !== undefined ? (patch.descriptionAr as string | null) : undefined,
      uploadPromptFr: patch.uploadPromptFr !== undefined ? (patch.uploadPromptFr as string | null) : undefined,
      uploadPromptAr: patch.uploadPromptAr !== undefined ? (patch.uploadPromptAr as string | null) : undefined,
      icon: patch.icon !== undefined ? String(patch.icon) : undefined,
      sortOrder: patch.sortOrder !== undefined ? Number(patch.sortOrder) : undefined,
      isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : undefined,
      tags: Array.isArray(patch.tags) ? patch.tags.map(String) : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const categoryId = request.nextUrl.searchParams.get('categoryId')?.trim();
  const documentTypeId = request.nextUrl.searchParams.get('documentTypeId')?.trim();

  try {
    const admin = getSupabaseServiceRoleClient();
    if (documentTypeId) {
      await deleteJuridiqueDocumentType(admin, documentTypeId);
      return NextResponse.json({ ok: true });
    }
    if (categoryId) {
      await deleteJuridiqueCategory(admin, categoryId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'delete_failed';
    const status = message.includes('protected') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

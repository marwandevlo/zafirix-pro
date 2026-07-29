import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const companyId = new URL(request.url).searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const [{ data: stores, error: storesErr }, { data: items, error: itemsErr }] = await Promise.all([
    admin.from('zafirix_stores').select('*').eq('company_id', access.companyId).eq('user_id', session.userId).order('name'),
    admin.from('zafirix_inventory_items').select('*').eq('company_id', access.companyId).eq('user_id', session.userId).order('name'),
  ]);

  if (storesErr) return mapDbError(storesErr);
  if (itemsErr) return mapDbError(itemsErr);

  const storeIds = (stores ?? []).map((s) => s.id);
  let stock: Record<string, unknown>[] = [];
  if (storeIds.length > 0) {
    const { data: stockData, error: stockErr } = await admin
      .from('zafirix_inventory_stock')
      .select('*, zafirix_stores(name), zafirix_inventory_items(sku, name, reorder_level, unit)')
      .in('store_id', storeIds)
      .eq('user_id', session.userId);
    if (stockErr) return mapDbError(stockErr, { stores: stores ?? [], items: items ?? [], stock: [], lowStockCount: 0 });
    stock = stockData ?? [];
  }

  const stockRows = stock.map((s: Record<string, unknown>) => {
    const store = s.zafirix_stores as { name?: string } | null;
    const item = s.zafirix_inventory_items as { sku?: string; name?: string; reorder_level?: number; unit?: string } | null;
    const qty = Number(s.quantity ?? 0);
    const reorder = Number(item?.reorder_level ?? 0);
    return {
      id: String(s.id),
      storeId: String(s.store_id),
      itemId: String(s.item_id),
      quantity: qty,
      storeName: store?.name ?? '',
      itemName: item?.name ?? '',
      itemSku: item?.sku ?? '',
      reorderLevel: reorder,
      unit: item?.unit ?? 'unité',
      isLowStock: reorder > 0 && qty <= reorder,
    };
  });

  return NextResponse.json({
    ok: true,
    stores: (stores ?? []).map((r) => ({
      id: String(r.id),
      name: r.name,
      code: r.code,
      address: r.address,
      isActive: r.is_active,
    })),
    items: (items ?? []).map((r) => ({
      id: String(r.id),
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      reorderLevel: Number(r.reorder_level ?? 0),
    })),
    stock: stockRows,
    lowStockCount: stockRows.filter((s) => s.isLowStock).length,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    action?: 'create_store' | 'create_item' | 'adjust_stock';
    companyId?: string;
    name?: string;
    code?: string;
    address?: string;
    sku?: string;
    unit?: string;
    reorderLevel?: number;
    storeId?: string;
    itemId?: string;
    quantity?: number;
  };

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  if (body.action === 'create_store' && body.name) {
    const { data, error } = await admin
      .from('zafirix_stores')
      .insert({
        user_id: session.userId,
        company_id: access.companyId,
        name: body.name,
        code: body.code ?? body.name.slice(0, 6).toUpperCase(),
        address: body.address ?? null,
      })
      .select('id, name, code')
      .single();
    if (error) return mapDbError(error);
    return NextResponse.json({ ok: true, store: data });
  }

  if (body.action === 'create_item' && body.name && body.sku) {
    const { data, error } = await admin
      .from('zafirix_inventory_items')
      .insert({
        user_id: session.userId,
        company_id: access.companyId,
        sku: body.sku,
        name: body.name,
        unit: body.unit ?? 'unité',
        reorder_level: body.reorderLevel ?? 0,
      })
      .select('id, sku, name')
      .single();
    if (error) return mapDbError(error);
    return NextResponse.json({ ok: true, item: data });
  }

  if (body.action === 'adjust_stock' && body.storeId && body.itemId && body.quantity != null) {
    const { data, error } = await admin
      .from('zafirix_inventory_stock')
      .upsert(
        {
          user_id: session.userId,
          company_id: access.companyId,
          store_id: body.storeId,
          item_id: body.itemId,
          quantity: body.quantity,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id,item_id' },
      )
      .select('id, quantity')
      .single();
    if (error) return mapDbError(error);
    return NextResponse.json({ ok: true, stock: data });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}

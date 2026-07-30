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
import {
  applyStockMovement,
  computeInventorySummary,
  createStockTransfer,
  enrichStockRow,
  processInvoiceInventoryCogs,
  recordItemUsage,
  rowToItem,
  rowToMovement,
  rowToStore,
  rowToTransfer,
  updateStockTransferStatus,
} from '@/app/lib/atlas-inventory-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import type { StockTransferStatus, StoreType } from '@/app/types/atlas-enterprise-modules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const view = searchParams.get('view') ?? 'dashboard';

  if (view === 'movements') {
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10));
    const { data, error } = await admin
      .from('zafirix_stock_movements')
      .select('*, zafirix_stores(name), zafirix_inventory_items(sku, name)')
      .eq('company_id', access.companyId)
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return mapDbError(error, { movements: [] });

    const movements = (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const store = row.zafirix_stores as { name?: string } | null;
      const item = row.zafirix_inventory_items as { sku?: string; name?: string } | null;
      return rowToMovement({
        ...row,
        store_name: store?.name,
        item_name: item?.name,
        item_sku: item?.sku,
      });
    });

    return NextResponse.json({ ok: true, movements });
  }

  if (view === 'transfers') {
    const { data: transfers, error } = await admin
      .from('zafirix_stock_transfers')
      .select('*')
      .eq('company_id', access.companyId)
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return mapDbError(error, { transfers: [] });

    const storeIds = new Set<string>();
    for (const t of transfers ?? []) {
      storeIds.add(String(t.from_store_id));
      storeIds.add(String(t.to_store_id));
    }

    const { data: stores } = storeIds.size
      ? await admin.from('zafirix_stores').select('id, name').in('id', [...storeIds])
      : { data: [] };
    const storeMap = new Map((stores ?? []).map((s) => [String(s.id), String(s.name)]));

    const transferIds = (transfers ?? []).map((t) => t.id);
    const { data: lines } = transferIds.length
      ? await admin
          .from('zafirix_stock_transfer_lines')
          .select('*, zafirix_inventory_items(sku, name)')
          .in('transfer_id', transferIds)
      : { data: [] };

    const linesByTransfer = new Map<string, typeof lines>();
    for (const line of lines ?? []) {
      const tid = String(line.transfer_id);
      const arr = linesByTransfer.get(tid) ?? [];
      arr.push(line);
      linesByTransfer.set(tid, arr);
    }

    const mapped = (transfers ?? []).map((t) => {
      const trLines = (linesByTransfer.get(String(t.id)) ?? []).map((l) => {
        const item = l.zafirix_inventory_items as { sku?: string; name?: string } | null;
        return {
          itemId: String(l.item_id),
          quantity: Number(l.quantity),
          unitCost: Number(l.unit_cost ?? 0),
          itemName: item?.name ?? '',
          itemSku: item?.sku ?? '',
        };
      });
      return rowToTransfer(
        {
          ...(t as Record<string, unknown>),
          from_store_name: storeMap.get(String(t.from_store_id)),
          to_store_name: storeMap.get(String(t.to_store_id)),
        },
        trLines,
      );
    });

    return NextResponse.json({ ok: true, transfers: mapped });
  }

  const [{ data: stores, error: storesErr }, { data: items, error: itemsErr }] = await Promise.all([
    admin
      .from('zafirix_stores')
      .select('*')
      .eq('company_id', access.companyId)
      .eq('user_id', session.userId)
      .order('name'),
    admin
      .from('zafirix_inventory_items')
      .select('*')
      .eq('company_id', access.companyId)
      .eq('user_id', session.userId)
      .order('name'),
  ]);

  if (storesErr) return mapDbError(storesErr);
  if (itemsErr) return mapDbError(itemsErr);

  const storeIds = (stores ?? []).map((s) => s.id);
  let stockRows: ReturnType<typeof enrichStockRow>[] = [];
  if (storeIds.length > 0) {
    const { data: stockData, error: stockErr } = await admin
      .from('zafirix_inventory_stock')
      .select('*, zafirix_stores(name), zafirix_inventory_items(sku, name, reorder_level, unit, unit_cost)')
      .in('store_id', storeIds)
      .eq('user_id', session.userId);
    if (stockErr) {
      return mapDbError(stockErr, {
        stores: [],
        items: [],
        stock: [],
        summary: { totalUnits: 0, totalValuation: 0, lowStockCount: 0, skuCount: 0 },
      });
    }
    stockRows = (stockData ?? []).map((s) => enrichStockRow(s as Record<string, unknown>));
  }

  const mappedStores = (stores ?? []).map((r) => rowToStore(r as Record<string, unknown>));
  const mappedItems = (items ?? []).map((r) => rowToItem(r as Record<string, unknown>));
  const summary = computeInventorySummary(stockRows, mappedItems);

  return NextResponse.json({
    ok: true,
    stores: mappedStores,
    items: mappedItems,
    stock: stockRows,
    summary,
    lowStockCount: summary.lowStockCount,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action as string | undefined;

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId as string | undefined);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const companyId = access.companyId;

  if (action === 'create_store' && body.name) {
    const { data, error } = await admin
      .from('zafirix_stores')
      .insert({
        user_id: session.userId,
        company_id: companyId,
        name: body.name,
        code: (body.code as string) ?? String(body.name).slice(0, 6).toUpperCase(),
        address: (body.address as string) ?? null,
        store_type: (body.storeType as StoreType) ?? 'point_of_sale',
      })
      .select('*')
      .single();
    if (error) return mapDbError(error);
    return NextResponse.json({ ok: true, store: rowToStore(data as Record<string, unknown>) });
  }

  if (action === 'create_item' && body.name && body.sku) {
    const { data, error } = await admin
      .from('zafirix_inventory_items')
      .insert({
        user_id: session.userId,
        company_id: companyId,
        sku: body.sku,
        name: body.name,
        unit: (body.unit as string) ?? 'unité',
        reorder_level: Number(body.reorderLevel ?? 0),
        unit_cost: Number(body.unitCost ?? 0),
        sale_price: Number(body.salePrice ?? 0),
        category: (body.category as string) ?? '',
      })
      .select('*')
      .single();
    if (error) return mapDbError(error);
    return NextResponse.json({ ok: true, item: rowToItem(data as Record<string, unknown>) });
  }

  if (action === 'adjust_stock' && body.storeId && body.itemId && body.quantity != null) {
    const targetQty = Number(body.quantity);
    const { data: existing } = await admin
      .from('zafirix_inventory_stock')
      .select('quantity')
      .eq('store_id', body.storeId)
      .eq('item_id', body.itemId)
      .eq('user_id', session.userId)
      .maybeSingle();

    const current = Number(existing?.quantity ?? 0);
    const delta = targetQty - current;
    if (delta === 0) {
      return NextResponse.json({ ok: true, stock: { quantity: targetQty } });
    }

    const result = await applyStockMovement(admin, {
      userId: session.userId,
      companyId,
      storeId: String(body.storeId),
      itemId: String(body.itemId),
      quantityDelta: delta,
      movementType: 'adjustment',
      notes: (body.notes as string) ?? 'Ajustement manuel',
      referenceType: 'manual',
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, stock: { quantity: result.quantityAfter, movementId: result.movementId } });
  }

  if (action === 'record_usage' && body.storeId && body.itemId && body.quantity) {
    const result = await recordItemUsage(admin, {
      userId: session.userId,
      companyId,
      storeId: String(body.storeId),
      itemId: String(body.itemId),
      quantity: Number(body.quantity),
      notes: body.notes as string | undefined,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, movementId: result.movementId, cogsAmount: result.cogsAmount });
  }

  if (action === 'create_transfer' && body.fromStoreId && body.toStoreId && Array.isArray(body.lines)) {
    const result = await createStockTransfer(admin, {
      userId: session.userId,
      companyId,
      fromStoreId: String(body.fromStoreId),
      toStoreId: String(body.toStoreId),
      lines: (body.lines as Array<{ itemId: string; quantity: number }>),
      notes: body.notes as string | undefined,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, transfer: result.transfer });
  }

  if (action === 'update_transfer' && body.transferId && body.status) {
    const result = await updateStockTransferStatus(admin, {
      userId: session.userId,
      companyId,
      transferId: String(body.transferId),
      status: body.status as StockTransferStatus,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, transfer: result.transfer });
  }

  if (action === 'process_invoice' && body.invoiceId && Array.isArray(body.lines)) {
    const result = await processInvoiceInventoryCogs(admin, {
      userId: session.userId,
      companyId,
      invoiceId: String(body.invoiceId),
      lines: body.lines as Array<{ itemId: string; storeId: string; quantity: number; unitCost?: number }>,
    });
    if (!result.ok) return apiBadRequest(result.error, apiErrorMessageFr(result.error));
    return NextResponse.json({ ok: true, totalCogs: result.totalCogs, lines: result.lines });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}

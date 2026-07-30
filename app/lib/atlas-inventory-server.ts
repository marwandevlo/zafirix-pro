/**
 * Advanced inventory server — stock movements, transfers, COGS, valuation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasInventoryItem,
  AtlasInventoryStock,
  AtlasInvoiceCogsLine,
  AtlasStockMovement,
  AtlasStockTransfer,
  AtlasStore,
  InventoryMovementType,
  StockTransferStatus,
  StoreType,
} from '@/app/types/atlas-enterprise-modules';

export type InventoryLineInput = {
  itemId: string;
  storeId: string;
  quantity: number;
  unitCost?: number;
};

export function rowToStore(row: Record<string, unknown>): AtlasStore {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    name: String(row.name ?? ''),
    code: String(row.code ?? ''),
    address: (row.address as string | null) ?? null,
    storeType: (row.store_type as StoreType) ?? 'point_of_sale',
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToItem(row: Record<string, unknown>): AtlasInventoryItem {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    sku: String(row.sku ?? ''),
    name: String(row.name ?? ''),
    unit: String(row.unit ?? 'unité'),
    reorderLevel: Number(row.reorder_level ?? 0),
    unitCost: Number(row.unit_cost ?? 0),
    salePrice: Number(row.sale_price ?? 0),
    category: String(row.category ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToMovement(row: Record<string, unknown>): AtlasStockMovement {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    storeId: String(row.store_id),
    itemId: String(row.item_id),
    movementType: row.movement_type as InventoryMovementType,
    quantityDelta: Number(row.quantity_delta ?? 0),
    quantityAfter: Number(row.quantity_after ?? 0),
    unitCost: Number(row.unit_cost ?? 0),
    totalCost: Number(row.total_cost ?? 0),
    referenceType: (row.reference_type as string | null) ?? null,
    referenceId: (row.reference_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    storeName: (row.store_name as string | undefined) ?? undefined,
    itemName: (row.item_name as string | undefined) ?? undefined,
    itemSku: (row.item_sku as string | undefined) ?? undefined,
  };
}

export function rowToTransfer(row: Record<string, unknown>, lines?: AtlasStockTransfer['lines']): AtlasStockTransfer {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    fromStoreId: String(row.from_store_id),
    toStoreId: String(row.to_store_id),
    status: row.status as StockTransferStatus,
    notes: (row.notes as string | null) ?? null,
    requestedAt: String(row.requested_at ?? row.created_at ?? ''),
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    fromStoreName: (row.from_store_name as string | undefined) ?? undefined,
    toStoreName: (row.to_store_name as string | undefined) ?? undefined,
    lines: lines ?? [],
  };
}

export function rowToCogs(row: Record<string, unknown>): AtlasInvoiceCogsLine {
  return {
    id: String(row.id),
    invoiceId: String(row.invoice_id),
    storeId: String(row.store_id),
    itemId: String(row.item_id),
    quantity: Number(row.quantity ?? 0),
    unitCost: Number(row.unit_cost ?? 0),
    cogsAmount: Number(row.cogs_amount ?? 0),
    movementId: (row.movement_id as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    itemName: (row.item_name as string | undefined) ?? undefined,
    itemSku: (row.item_sku as string | undefined) ?? undefined,
    storeName: (row.store_name as string | undefined) ?? undefined,
  };
}

async function getStockQuantity(
  admin: SupabaseClient,
  userId: string,
  storeId: string,
  itemId: string,
): Promise<number> {
  const { data } = await admin
    .from('zafirix_inventory_stock')
    .select('quantity')
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .eq('item_id', itemId)
    .maybeSingle();
  return Number(data?.quantity ?? 0);
}

async function resolveItemUnitCost(
  admin: SupabaseClient,
  userId: string,
  itemId: string,
  override?: number,
): Promise<number> {
  if (override != null && override >= 0) return override;
  const { data } = await admin
    .from('zafirix_inventory_items')
    .select('unit_cost')
    .eq('user_id', userId)
    .eq('id', itemId)
    .maybeSingle();
  return Number(data?.unit_cost ?? 0);
}

/** Apply signed quantity delta with full audit trail. */
export async function applyStockMovement(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    storeId: string;
    itemId: string;
    quantityDelta: number;
    movementType: InventoryMovementType;
    unitCost?: number;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
  },
): Promise<{ ok: true; movementId: string; quantityAfter: number } | { ok: false; error: string }> {
  if (input.quantityDelta === 0) return { ok: false, error: 'zero_delta' };

  const current = await getStockQuantity(admin, input.userId, input.storeId, input.itemId);
  const next = current + input.quantityDelta;
  if (next < 0) return { ok: false, error: 'insufficient_stock' };

  const unitCost = await resolveItemUnitCost(admin, input.userId, input.itemId, input.unitCost);
  const totalCost = Math.abs(input.quantityDelta) * unitCost;

  const { data: movement, error: movErr } = await admin
    .from('zafirix_stock_movements')
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      store_id: input.storeId,
      item_id: input.itemId,
      movement_type: input.movementType,
      quantity_delta: input.quantityDelta,
      quantity_after: next,
      unit_cost: unitCost,
      total_cost: totalCost,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      notes: input.notes ?? null,
    })
    .select('id')
    .single();

  if (movErr) return { ok: false, error: movErr.message };

  const { error: stockErr } = await admin.from('zafirix_inventory_stock').upsert(
    {
      user_id: input.userId,
      company_id: input.companyId,
      store_id: input.storeId,
      item_id: input.itemId,
      quantity: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'store_id,item_id' },
  );

  if (stockErr) return { ok: false, error: stockErr.message };

  return { ok: true, movementId: String(movement.id), quantityAfter: next };
}

export async function recordItemUsage(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    storeId: string;
    itemId: string;
    quantity: number;
    notes?: string;
  },
): Promise<{ ok: true; movementId: string; cogsAmount: number } | { ok: false; error: string }> {
  if (input.quantity <= 0) return { ok: false, error: 'invalid_quantity' };
  const unitCost = await resolveItemUnitCost(admin, input.userId, input.itemId);
  const result = await applyStockMovement(admin, {
    ...input,
    quantityDelta: -input.quantity,
    movementType: 'usage',
    unitCost,
    referenceType: 'usage',
    notes: input.notes ?? 'Consommation / usage interne',
  });
  if (!result.ok) return result;
  return { ok: true, movementId: result.movementId, cogsAmount: input.quantity * unitCost };
}

/** Deduct stock + record COGS when a sales invoice is finalized. Idempotent per invoice. */
export async function processInvoiceInventoryCogs(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    invoiceId: string;
    lines: InventoryLineInput[];
  },
): Promise<{ ok: true; totalCogs: number; lines: AtlasInvoiceCogsLine[] } | { ok: false; error: string }> {
  if (!input.lines.length) return { ok: true, totalCogs: 0, lines: [] };

  const { data: existing } = await admin
    .from('zafirix_invoice_cogs')
    .select('id')
    .eq('invoice_id', input.invoiceId)
    .limit(1);
  if (existing?.length) {
    const { data: rows } = await admin
      .from('zafirix_invoice_cogs')
      .select('*')
      .eq('invoice_id', input.invoiceId);
    const mapped = (rows ?? []).map((r) => rowToCogs(r as Record<string, unknown>));
    const totalCogs = mapped.reduce((s, l) => s + l.cogsAmount, 0);
    return { ok: true, totalCogs, lines: mapped };
  }

  const cogsLines: AtlasInvoiceCogsLine[] = [];
  let totalCogs = 0;

  for (const line of input.lines) {
    if (line.quantity <= 0) continue;
    const unitCost = await resolveItemUnitCost(admin, input.userId, line.itemId, line.unitCost);
    const mov = await applyStockMovement(admin, {
      userId: input.userId,
      companyId: input.companyId,
      storeId: line.storeId,
      itemId: line.itemId,
      quantityDelta: -line.quantity,
      movementType: 'sale',
      unitCost,
      referenceType: 'invoice',
      referenceId: input.invoiceId,
      notes: `Vente facture ${input.invoiceId}`,
    });
    if (!mov.ok) return mov;

    const cogsAmount = line.quantity * unitCost;
    totalCogs += cogsAmount;

    const { data: cogsRow, error: cogsErr } = await admin
      .from('zafirix_invoice_cogs')
      .insert({
        user_id: input.userId,
        company_id: input.companyId,
        invoice_id: input.invoiceId,
        store_id: line.storeId,
        item_id: line.itemId,
        quantity: line.quantity,
        unit_cost: unitCost,
        cogs_amount: cogsAmount,
        movement_id: mov.movementId,
      })
      .select('*')
      .single();

    if (cogsErr) return { ok: false, error: cogsErr.message };
    cogsLines.push(rowToCogs(cogsRow as Record<string, unknown>));
  }

  const { data: invoice } = await admin
    .from('atlas_invoices')
    .select('metadata')
    .eq('id', input.invoiceId)
    .maybeSingle();

  const metadata = (invoice?.metadata ?? {}) as Record<string, unknown>;
  await admin
    .from('atlas_invoices')
    .update({
      metadata: { ...metadata, cogsTotal: totalCogs, inventoryProcessedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.invoiceId);

  return { ok: true, totalCogs, lines: cogsLines };
}

export async function createStockTransfer(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    fromStoreId: string;
    toStoreId: string;
    lines: Array<{ itemId: string; quantity: number }>;
    notes?: string;
  },
): Promise<{ ok: true; transfer: AtlasStockTransfer } | { ok: false; error: string }> {
  if (input.fromStoreId === input.toStoreId) return { ok: false, error: 'same_store' };
  if (!input.lines.length) return { ok: false, error: 'empty_lines' };

  for (const line of input.lines) {
    const qty = await getStockQuantity(admin, input.userId, input.fromStoreId, line.itemId);
    if (qty < line.quantity) return { ok: false, error: 'insufficient_stock' };
  }

  const { data: transfer, error: trErr } = await admin
    .from('zafirix_stock_transfers')
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      from_store_id: input.fromStoreId,
      to_store_id: input.toStoreId,
      status: 'pending',
      notes: input.notes ?? null,
    })
    .select('*')
    .single();

  if (trErr) return { ok: false, error: trErr.message };

  const lineRows = await Promise.all(
    input.lines.map(async (line) => {
      const unitCost = await resolveItemUnitCost(admin, input.userId, line.itemId);
      return {
        transfer_id: transfer.id,
        item_id: line.itemId,
        quantity: line.quantity,
        unit_cost: unitCost,
        unitCost,
        itemId: line.itemId,
        quantityOut: line.quantity,
      };
    }),
  );

  const { error: linesErr } = await admin.from('zafirix_stock_transfer_lines').insert(
    lineRows.map(({ transfer_id, item_id, quantity, unit_cost }) => ({
      transfer_id,
      item_id,
      quantity,
      unit_cost,
    })),
  );
  if (linesErr) return { ok: false, error: linesErr.message };

  const { data: items } = await admin
    .from('zafirix_inventory_items')
    .select('id, sku, name')
    .in('id', input.lines.map((l) => l.itemId));

  const itemMap = new Map((items ?? []).map((i) => [String(i.id), i]));

  return {
    ok: true,
    transfer: rowToTransfer(transfer as Record<string, unknown>, lineRows.map((l) => ({
      itemId: l.itemId,
      quantity: l.quantityOut,
      unitCost: l.unitCost,
      itemName: String(itemMap.get(l.itemId)?.name ?? ''),
      itemSku: String(itemMap.get(l.itemId)?.sku ?? ''),
    }))),
  };
}

export async function updateStockTransferStatus(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    transferId: string;
    status: StockTransferStatus;
  },
): Promise<{ ok: true; transfer: AtlasStockTransfer } | { ok: false; error: string }> {
  const { data: transfer, error: fetchErr } = await admin
    .from('zafirix_stock_transfers')
    .select('*')
    .eq('id', input.transferId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (fetchErr || !transfer) return { ok: false, error: 'transfer_not_found' };

  if (input.status === 'completed') {
    if (transfer.status === 'completed') {
      return { ok: true, transfer: rowToTransfer(transfer as Record<string, unknown>) };
    }
    if (transfer.status === 'cancelled') return { ok: false, error: 'transfer_cancelled' };

    const { data: lines } = await admin
      .from('zafirix_stock_transfer_lines')
      .select('*')
      .eq('transfer_id', input.transferId);

    for (const line of lines ?? []) {
      const qty = Number(line.quantity);
      const unitCost = Number(line.unit_cost ?? 0);
      const itemId = String(line.item_id);

      const out = await applyStockMovement(admin, {
        userId: input.userId,
        companyId: input.companyId,
        storeId: String(transfer.from_store_id),
        itemId,
        quantityDelta: -qty,
        movementType: 'transfer_out',
        unitCost,
        referenceType: 'transfer',
        referenceId: input.transferId,
      });
      if (!out.ok) return out;

      const inn = await applyStockMovement(admin, {
        userId: input.userId,
        companyId: input.companyId,
        storeId: String(transfer.to_store_id),
        itemId,
        quantityDelta: qty,
        movementType: 'transfer_in',
        unitCost,
        referenceType: 'transfer',
        referenceId: input.transferId,
      });
      if (!inn.ok) return inn;
    }

    const { data: updated, error: updErr } = await admin
      .from('zafirix_stock_transfers')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.transferId)
      .select('*')
      .single();

    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true, transfer: rowToTransfer(updated as Record<string, unknown>) };
  }

  const { data: updated, error: updErr } = await admin
    .from('zafirix_stock_transfers')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.transferId)
    .select('*')
    .single();

  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, transfer: rowToTransfer(updated as Record<string, unknown>) };
}

export function enrichStockRow(
  s: Record<string, unknown>,
): AtlasInventoryStock & { isLowStock: boolean; valuation: number } {
  const store = s.zafirix_stores as { name?: string } | null;
  const item = s.zafirix_inventory_items as {
    sku?: string;
    name?: string;
    reorder_level?: number;
    unit?: string;
    unit_cost?: number;
  } | null;
  const qty = Number(s.quantity ?? 0);
  const reorder = Number(item?.reorder_level ?? 0);
  const unitCost = Number(item?.unit_cost ?? 0);
  return {
    id: String(s.id),
    storeId: String(s.store_id),
    itemId: String(s.item_id),
    quantity: qty,
    updatedAt: String(s.updated_at ?? ''),
    storeName: store?.name ?? '',
    itemName: item?.name ?? '',
    itemSku: item?.sku ?? '',
    reorderLevel: reorder,
    unit: item?.unit ?? 'unité',
    unitCost,
    valuation: qty * unitCost,
    isLowStock: reorder > 0 && qty <= reorder,
  };
}

export function computeInventorySummary(
  stock: Array<AtlasInventoryStock & { isLowStock?: boolean; valuation?: number }>,
  items: AtlasInventoryItem[],
): {
  totalUnits: number;
  totalValuation: number;
  lowStockCount: number;
  skuCount: number;
} {
  const totalUnits = stock.reduce((s, r) => s + r.quantity, 0);
  const totalValuation = stock.reduce((s, r) => s + (r.valuation ?? r.quantity * (r.unitCost ?? 0)), 0);
  const lowStockCount = stock.filter((r) => r.isLowStock).length;
  return { totalUnits, totalValuation, lowStockCount, skuCount: items.length };
}

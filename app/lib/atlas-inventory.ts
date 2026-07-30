/**
 * Client helper — process invoice inventory lines for COGS after invoice save.
 */

import type { InventoryLineInput } from '@/app/lib/atlas-inventory-server';

export type InvoiceInventoryMetadata = {
  inventoryLines?: InventoryLineInput[];
  cogsTotal?: number;
  inventoryProcessedAt?: string;
};

/** Call after invoice upsert when metadata contains inventory line items. */
export async function syncInvoiceInventoryCogs(
  companyId: string,
  invoiceId: string,
  lines: InventoryLineInput[],
): Promise<{ ok: boolean; totalCogs?: number; error?: string }> {
  if (!lines.length) return { ok: true, totalCogs: 0 };

  const res = await fetch('/api/inventory', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'process_invoice',
      companyId,
      invoiceId,
      lines,
    }),
  });

  const json = (await res.json()) as { ok?: boolean; totalCogs?: number; error?: string };
  if (!json.ok) return { ok: false, error: json.error ?? 'cogs_failed' };
  return { ok: true, totalCogs: json.totalCogs };
}

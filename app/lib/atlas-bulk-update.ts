import { showAtlasErrorToast, showAtlasSuccessToast } from '@/app/lib/atlas-toast';

export function formatBulkUpdateError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err != null && 'error' in err
        ? String((err as { error: unknown }).error)
        : String(err ?? '');

  const msg = raw.trim();
  if (!msg) return 'La mise à jour groupée a échoué. Veuillez réessayer.';

  if (/auth_required|401/i.test(msg)) {
    return 'Connectez-vous pour modifier ces éléments.';
  }
  if (/invalid_ice/i.test(msg)) {
    return 'ICE fournisseur invalide (15 chiffres requis).';
  }
  if (/invalid_if/i.test(msg)) {
    return 'IF fournisseur invalide (7 à 8 chiffres requis).';
  }
  if (/ids_required|invalid_body/i.test(msg)) {
    return 'Aucun identifiant valide à mettre à jour.';
  }

  return msg;
}

export async function postBulkSupplierInvoiceUpdate(
  ids: string[],
  fields: { supplierIce: string; supplierIf: string },
): Promise<number> {
  const res = await fetch('/api/supplier-invoices/bulk-update', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ids,
      supplierIce: fields.supplierIce,
      supplierIf: fields.supplierIf,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    updated?: number;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
  }

  return typeof data.updated === 'number' ? data.updated : ids.length;
}

export async function postBulkTvaSuggestionUpdate(
  ids: string[],
  fields: { supplierIce: string; supplierIf: string },
): Promise<number> {
  const res = await fetch('/api/tva/suggestions/bulk-update', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ids,
      supplierIce: fields.supplierIce,
      supplierIf: fields.supplierIf,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    updated?: number;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
  }

  return typeof data.updated === 'number' ? data.updated : ids.length;
}

export async function runBulkTvaLineIdentityUpdate(options: {
  supplierInvoiceIds: string[];
  tvaSuggestionIds: string[];
  supplierIce: string;
  supplierIf: string;
  onSuccess?: () => void;
}): Promise<boolean> {
  const totalTargets = options.supplierInvoiceIds.length + options.tvaSuggestionIds.length;
  if (totalTargets === 0) return false;

  try {
    let updated = 0;
    if (options.supplierInvoiceIds.length) {
      updated += await postBulkSupplierInvoiceUpdate(options.supplierInvoiceIds, {
        supplierIce: options.supplierIce,
        supplierIf: options.supplierIf,
      });
    }
    if (options.tvaSuggestionIds.length) {
      updated += await postBulkTvaSuggestionUpdate(options.tvaSuggestionIds, {
        supplierIce: options.supplierIce,
        supplierIf: options.supplierIf,
      });
    }
    showAtlasSuccessToast(`${updated} ligne(s) mise(s) à jour (ICE / IF).`);
    options.onSuccess?.();
    return true;
  } catch (err) {
    showAtlasErrorToast(formatBulkUpdateError(err));
    return false;
  }
}

export async function runBulkSupplierInvoiceIdentityUpdate(options: {
  ids: string[];
  supplierIce: string;
  supplierIf: string;
  onSuccess?: () => void;
}): Promise<boolean> {
  try {
    const updated = await postBulkSupplierInvoiceUpdate(options.ids, {
      supplierIce: options.supplierIce,
      supplierIf: options.supplierIf,
    });
    showAtlasSuccessToast(`${updated} facture(s) fournisseur mise(s) à jour (ICE / IF).`);
    options.onSuccess?.();
    return true;
  } catch (err) {
    showAtlasErrorToast(formatBulkUpdateError(err));
    return false;
  }
}

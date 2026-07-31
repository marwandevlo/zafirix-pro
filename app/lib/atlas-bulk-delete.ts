import { showAtlasErrorToast, showAtlasSuccessToast, showAtlasWarningToast } from '@/app/lib/atlas-toast';
import { isSyntheticTableRowId } from '@/app/lib/atlas-id-validation';

const DEFAULT_BATCH_SIZE = 20;

/** Human-readable message for delete failures (FK constraints, auth, etc.). */
export function formatBulkDeleteError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err != null && 'error' in err
        ? String((err as { error: unknown }).error)
        : String(err ?? '');

  const msg = raw.trim();
  if (!msg) return 'La suppression a échoué. Veuillez réessayer.';

  if (/foreign key|23503|violates foreign key|referenced from|still referenced|FK_/i.test(msg)) {
    return 'Suppression impossible : certains enregistrements sont encore liés à d\'autres données (contrainte de clé étrangère).';
  }
  if (/auth_required|401/i.test(msg)) {
    return 'Connectez-vous pour supprimer ces éléments.';
  }
  if (/not_found|404/i.test(msg)) {
    return 'Un ou plusieurs éléments sont introuvables ou déjà supprimés.';
  }
  if (/company_required|company_and_ids_required/i.test(msg)) {
    return 'Sélectionnez une société active avant de supprimer.';
  }
  if (/invalid input syntax for type uuid|22P02/i.test(msg)) {
    return 'Identifiants invalides : seuls les enregistrements avec un UUID valide peuvent être supprimés en base.';
  }
  if (/ids_required|invalid_body/i.test(msg)) {
    return 'Aucun identifiant valide à supprimer.';
  }

  return msg;
}

/** Drop synthetic row ids produced when source rows lack stable ids. */
export function filterPersistableIds(ids: string[]): string[] {
  return ids
    .map((id) => String(id).trim())
    .filter((id) => !isSyntheticTableRowId(id));
}

export async function runInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((item) => fn(item)));
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (rejected) throw rejected.reason;
  }
}

export async function postBulkDelete(apiPath: string, ids: string[]): Promise<number> {
  const res = await fetch(apiPath, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    deleted?: number;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
  }

  return typeof data.deleted === 'number' ? data.deleted : ids.length;
}

export type OptimisticBulkDeleteOptions = {
  ids: string[];
  confirmMessage?: string;
  /** When true, skip window.confirm (e.g. GlobalTable already confirmed). */
  skipConfirm?: boolean;
  onOptimistic: () => void;
  onRollback?: () => void;
  onPersist?: (ids: string[]) => void | Promise<void>;
  onPersistError?: (err: unknown) => void;
  onSuccess?: (ids: string[]) => void;
  successMessage?: string | ((count: number) => string);
};

/**
 * Confirm → optimistic UI → persist with rollback + toast feedback on failure.
 */
export async function runOptimisticBulkDelete(options: OptimisticBulkDeleteOptions): Promise<boolean> {
  const persistableIds = filterPersistableIds(options.ids);
  const skipped = options.ids.length - persistableIds.length;

  if (persistableIds.length === 0) {
    showAtlasErrorToast('Aucun identifiant valide à supprimer.');
    return false;
  }

  if (skipped > 0) {
    showAtlasWarningToast(`${skipped} ligne(s) ignorée(s) — identifiant synthétique ou invalide.`);
  }

  const message =
    options.confirmMessage ??
    `Supprimer ${persistableIds.length} élément(s) ? Cette action est irréversible.`;

  if (
    !options.skipConfirm &&
    typeof window !== 'undefined' &&
    !window.confirm(message)
  ) {
    return false;
  }

  options.onOptimistic();

  if (!options.onPersist) {
    options.onSuccess?.(persistableIds);
    const successText =
      typeof options.successMessage === 'function'
        ? options.successMessage(persistableIds.length)
        : options.successMessage ?? `${persistableIds.length} élément(s) supprimé(s).`;
    showAtlasSuccessToast(successText);
    return true;
  }

  try {
    await options.onPersist(persistableIds);
    options.onSuccess?.(persistableIds);
    const successText =
      typeof options.successMessage === 'function'
        ? options.successMessage(persistableIds.length)
        : options.successMessage ?? `${persistableIds.length} élément(s) supprimé(s).`;
    showAtlasSuccessToast(successText);
    return true;
  } catch (err) {
    console.error('Bulk delete failed:', err);
    options.onRollback?.();
    options.onPersistError?.(err);
    showAtlasErrorToast(formatBulkDeleteError(err));
    return false;
  }
}

export type AtlasToastType = 'success' | 'error' | 'warning' | 'info';

export type AtlasToastPayload = {
  id: string;
  type: AtlasToastType;
  message: string;
  durationMs?: number;
};

type AtlasToastListener = (toast: AtlasToastPayload) => void;

const listeners = new Set<AtlasToastListener>();

let toastCounter = 0;

export function subscribeAtlasToasts(listener: AtlasToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitToast(toast: AtlasToastPayload): void {
  for (const listener of listeners) listener(toast);
}

export function showAtlasToast(
  type: AtlasToastType,
  message: string,
  durationMs = type === 'error' ? 7000 : 4500,
): void {
  emitToast({
    id: `toast-${++toastCounter}`,
    type,
    message,
    durationMs,
  });
}

export function showAtlasSuccessToast(message: string): void {
  showAtlasToast('success', message);
}

export function showAtlasErrorToast(message: string): void {
  showAtlasToast('error', message);
}

export function showAtlasWarningToast(message: string): void {
  showAtlasToast('warning', message);
}

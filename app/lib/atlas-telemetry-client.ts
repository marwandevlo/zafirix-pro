/**
 * Non-blocking POST for analytics / referral clicks.
 * Prefers sendBeacon so it never waits on the main thread or navigation.
 */
export function sendTelemetry(url: string, payload: unknown): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify(payload);

  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    // fall through to fetch
  }

  const send = () => {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      // fire-and-forget
    });
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(send, { timeout: 1500 });
    return;
  }
  setTimeout(send, 0);
}

export function runWhenIdle(task: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(task, { timeout: 1500 });
    return () => cancelIdleCallback(id);
  }
  const timer = window.setTimeout(task, 0);
  return () => window.clearTimeout(timer);
}

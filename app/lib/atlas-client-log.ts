'use client';

/**
 * Phase 16 — Client-side exception capture (Sentry when configured).
 */
export async function captureAtlasClientException(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  if (process.env.NODE_ENV === 'development') {
    console.error('[atlas-client]', msg, context);
  }
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN && !process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(err instanceof Error ? err : new Error(msg), { extra: context });
  } catch {
    /* optional */
  }
}

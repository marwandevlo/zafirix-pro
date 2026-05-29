/**
 * Structured server-side logging. Prefer this over ad-hoc console.error for ops.
 * When SENTRY_DSN is set and @sentry/nextjs is installed, exceptions are forwarded.
 */
export function logAtlasServerEvent(
  scope: string,
  level: 'error' | 'warn' | 'info',
  message: string,
  extra?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    scope,
    level,
    message,
    ...extra,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export async function captureAtlasServerException(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  logAtlasServerEvent('exception', 'error', msg, context);
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(err instanceof Error ? err : new Error(msg), {
      extra: context,
    });
  } catch {
    // Sentry optional at install time
  }
}

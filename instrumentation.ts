export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAtlasDomPolyfills } = await import('@/app/lib/atlas-dom-polyfill');
    ensureAtlasDomPolyfills();
    const { validateProductionConfiguration } = await import('@/app/lib/atlas-production-config');
    validateProductionConfiguration();
    if (process.env.SENTRY_DSN) {
      await import('./sentry.server.config');
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge' && process.env.SENTRY_DSN) {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string },
) {
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(err, {
      extra: { path: request.path, method: request.method, ...context },
    });
  } catch {
    /* optional */
  }
}

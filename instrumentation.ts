export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateProductionConfiguration } = await import('@/app/lib/atlas-production-config');
    validateProductionConfiguration();
  }

  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    // Optional dependency: specifier kept non-literal so the build does not
    // require @sentry/nextjs to be installed (peer range lags Next 16).
    const sentryPkg: string = '@sentry/nextjs';
    const Sentry = await import(sentryPkg);
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    });
  } catch {
    // Init failed — app still runs; check SENTRY_DSN and @sentry/nextjs compatibility with your Next version.
  }
}

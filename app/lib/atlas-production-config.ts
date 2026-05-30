/**
 * Sprint 0 — production configuration validation (called from instrumentation.register).
 * Logs only; does not exit the process (avoid breaking edge deploys while env is being wired).
 */

const PREFIX = '[atlas:prod-config]';

function isProductionNode(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_RUNTIME === 'nodejs';
}

export function validateProductionConfiguration(): void {
  if (!isProductionNode()) return;

  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length) {
    console.error(`${PREFIX} Missing required public Supabase env: ${missing.join(', ')}`);
  }

  if (!process.env.PADDLE_WEBHOOK_SECRET?.trim()) {
    console.error(
      `${PREFIX} PADDLE_WEBHOOK_SECRET is required in production. Paddle webhooks will reject requests until set.`,
    );
  }

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!service.trim()) {
    console.warn(
      `${PREFIX} SUPABASE_SERVICE_ROLE_KEY not set — admin user listing, analytics insert, and Paddle sync may fail.`,
    );
  }

  if (!process.env.PADDLE_API_KEY?.trim()) {
    console.warn(`${PREFIX} PADDLE_API_KEY not set — server-side Paddle operations may be unavailable.`);
  }

  const anthropic = process.env['ANTHROPIC_API_KEY'];
  if (typeof anthropic !== 'string' || !anthropic.trim()) {
    console.error(
      `${PREFIX} ANTHROPIC_API_KEY is required in production for Consultant IA, Juridique, and OCR. ` +
        'Add it in Vercel → Settings → Environment Variables → Production, then redeploy.',
    );
  }
}

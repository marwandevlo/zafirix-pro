/**
 * Phase 16 — Health, dependency probes, and observability metrics.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type HealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export type DependencyCheck = {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  detail?: string;
};

export type HealthSnapshot = {
  status: HealthStatus;
  timestamp: string;
  version: string;
  environment: string;
};

export type MetricsSnapshot = {
  timestamp: string;
  activeUsers24h: number;
  aiUsage24h: number;
  ocrUsage24h: number;
  documentUploads24h: number;
  apiErrors24h: number;
  quotaViolations24h: number;
  payrollRuns24h: number;
  bankImports24h: number;
};

const APP_VERSION = process.env.npm_package_version ?? '0.1.0';

export function buildHealthSnapshot(): HealthSnapshot {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    environment: process.env.NODE_ENV ?? 'development',
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; value?: T; error?: string }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - start, value };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function probeDependencies(db: SupabaseClient | null): Promise<{
  status: HealthStatus;
  checks: DependencyCheck[];
}> {
  const checks: DependencyCheck[] = [];

  const dbProbe = await timed(async () => {
    if (!db) throw new Error('service_role_unavailable');
    const { error } = await db.from('atlas_subscription_plans').select('id').limit(1);
    if (error) throw new Error(error.message);
  });
  checks.push({
    name: 'database',
    status: dbProbe.ok ? 'ok' : 'down',
    latencyMs: dbProbe.ms,
    detail: dbProbe.error,
  });

  const storageConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  checks.push({
    name: 'storage',
    status: storageConfigured ? 'ok' : 'degraded',
    detail: storageConfigured ? 'supabase_storage_configured' : 'missing_public_supabase_env',
  });

  const aiConfigured = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  checks.push({
    name: 'ai_provider',
    status: aiConfigured ? 'ok' : 'degraded',
    detail: aiConfigured ? 'anthropic_or_openai_configured' : 'no_ai_key',
  });

  const billingProbe = await timed(async () => {
    if (!db) throw new Error('service_role_unavailable');
    const { error } = await db.from('atlas_workspace_subscriptions').select('id').limit(1);
    if (error) throw new Error(error.message);
  });
  checks.push({
    name: 'billing',
    status: billingProbe.ok ? 'ok' : 'degraded',
    latencyMs: billingProbe.ms,
    detail: billingProbe.error,
  });

  checks.push({
    name: 'queue',
    status: 'ok',
    detail: 'vercel_background_ocr_jobs',
  });

  const down = checks.some((c) => c.status === 'down');
  const degraded = checks.some((c) => c.status === 'degraded');
  return {
    status: down ? 'down' : degraded ? 'degraded' : 'ok',
    checks,
  };
}

export async function collectMetrics(db: SupabaseClient): Promise<MetricsSnapshot> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [usage, auditQuota, auditErrors] = await Promise.all([
    db.from('atlas_usage_events').select('feature_code, quantity, user_id').gte('created_at', since),
    db
      .from('atlas_audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .contains('metadata', { event: 'quota_violation' }),
    db
      .from('atlas_audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .eq('action', 'rejected'),
  ]);

  const rows = usage.data ?? [];
  const users = new Set<string>();
  let ai = 0;
  let ocr = 0;
  let docs = 0;
  let payroll = 0;
  let bank = 0;

  for (const r of rows) {
    if (r.user_id) users.add(String(r.user_id));
    const qty = Number(r.quantity ?? 1);
    const code = String(r.feature_code);
    if (code === 'ai_requests_limit') ai += qty;
    else if (code === 'ocr_limit') ocr += qty;
    else if (code === 'documents_per_month') docs += qty;
    else if (code === 'payroll_limit') payroll += qty;
    else if (code === 'bank_accounts_limit') bank += qty;
  }

  return {
    timestamp: new Date().toISOString(),
    activeUsers24h: users.size,
    aiUsage24h: ai,
    ocrUsage24h: ocr,
    documentUploads24h: docs,
    apiErrors24h: auditErrors.count ?? 0,
    quotaViolations24h: auditQuota.count ?? 0,
    payrollRuns24h: payroll,
    bankImports24h: bank,
  };
}

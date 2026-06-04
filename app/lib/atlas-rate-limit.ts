/**
 * Phase 16 — Workspace-aware in-memory rate limiting (per server instance).
 */

import { checkAiRateLimit } from '@/app/lib/ai-rate-limit';

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number; code: 'rate_limited' };

type Bucket = { resetAtMs: number; count: number };

const buckets = new Map<string, Bucket>();

export type RateLimitBucket =
  | 'ai_chat'
  | 'ai_audit'
  | 'ai_executive'
  | 'ocr'
  | 'document_upload'
  | 'bank_import'
  | 'payroll_run';

const DEFAULTS: Record<RateLimitBucket, { windowSec: number; max: number }> = {
  ai_chat: { windowSec: 60, max: 30 },
  ai_audit: { windowSec: 300, max: 10 },
  ai_executive: { windowSec: 300, max: 10 },
  ocr: { windowSec: 60, max: 40 },
  document_upload: { windowSec: 60, max: 60 },
  bank_import: { windowSec: 300, max: 20 },
  payroll_run: { windowSec: 300, max: 15 },
};

function envOverride(bucket: RateLimitBucket): { windowSec: number; max: number } {
  const base = DEFAULTS[bucket];
  const envKey = bucket.toUpperCase();
  const windowSec = Number.parseInt(process.env[`ATLAS_RL_${envKey}_WINDOW_SEC`] ?? '', 10);
  const max = Number.parseInt(process.env[`ATLAS_RL_${envKey}_MAX`] ?? '', 10);
  return {
    windowSec: Number.isFinite(windowSec) && windowSec > 0 ? windowSec : base.windowSec,
    max: Number.isFinite(max) && max > 0 ? max : base.max,
  };
}

export function checkWorkspaceRateLimit(
  workspaceId: string,
  bucket: RateLimitBucket,
  userId?: string,
): RateLimitResult {
  const { windowSec, max } = envOverride(bucket);
  const key = userId
    ? `ws:${workspaceId}:${bucket}:${userId}`
    : `ws:${workspaceId}:${bucket}`;

  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAtMs <= now) {
    buckets.set(key, { resetAtMs: now + windowSec * 1000, count: 1 });
    return { ok: true };
  }

  if (existing.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000)),
      code: 'rate_limited',
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { ok: true };
}

/** Legacy AI limiter — kept for backward compatibility. */
export function checkAiEndpointRateLimit(userKey: string): RateLimitResult {
  const r = checkAiRateLimit(userKey);
  if (r.ok) return { ok: true };
  return { ok: false, retryAfterSec: r.retryAfterSec, code: 'rate_limited' };
}

export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return {
    status: 429 as const,
    body: {
      error: result.code,
      code: result.code,
      retryAfterSec: result.retryAfterSec,
    },
  };
}

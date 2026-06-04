/**
 * GET /api/billing/plans
 */
import { NextResponse } from 'next/server';
import { listSubscriptionPlans } from '@/app/lib/atlas-billing-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getSupabaseServiceRoleClient();
  const plans = await listSubscriptionPlans(db);
  return NextResponse.json({ ok: true, plans });
}

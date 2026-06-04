import { NextResponse } from 'next/server';
import { buildHealthSnapshot, probeDependencies } from '@/app/lib/atlas-health-engine';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let db = null;
  try {
    db = getSupabaseServiceRoleClient();
  } catch {
    db = null;
  }

  const base = buildHealthSnapshot();
  const deps = await probeDependencies(db);

  return NextResponse.json(
    {
      ...base,
      status: deps.status,
      dependencies: deps.checks,
    },
    {
      status: deps.status === 'down' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

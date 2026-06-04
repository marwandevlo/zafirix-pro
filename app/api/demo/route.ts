/**
 * GET/POST /api/demo — Phase 17 demo workspace (isolated client-side; server acknowledges)
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: 'session_isolated',
    storage: 'sessionStorage',
    keys: ['atlas_demo_mode_v1', 'atlas_demo_workspace_data_v1'],
    note: 'Demo data never writes to Supabase. Use generateDemoWorkspace() on the client.',
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = String(body.action ?? 'generate');
  return NextResponse.json({
    ok: true,
    action,
    isolated: true,
    sample: {
      invoices: 2,
      entries: 2,
      tvaLines: 2,
      payrollRuns: 1,
      bankTx: 2,
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  checkFreemiumMeter,
  consumeFreemiumMeter,
  freemiumDeniedResponse,
  getFreemiumSnapshot,
} from '@/app/lib/atlas-freemium-server';
import type { FreemiumMeter } from '@/app/lib/atlas-freemium';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METERS = new Set<FreemiumMeter>(['invoices', 'cod', 'ai_scans', 'team']);

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const db = getSupabaseServiceRoleClient();
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  const snapshot = await getFreemiumSnapshot(db, userId, workspaceId);

  return NextResponse.json({ ok: true, ...snapshot });
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    meter?: string;
    quantity?: number;
    consume?: boolean;
    workspaceId?: string;
  };
  const meter = String(body.meter ?? '') as FreemiumMeter;
  if (!METERS.has(meter)) {
    return NextResponse.json({ error: 'unknown_meter' }, { status: 400 });
  }

  const db = getSupabaseServiceRoleClient();
  const qty = Number(body.quantity ?? 1) || 1;
  const result = body.consume
    ? await consumeFreemiumMeter(db, userId, meter, qty, body.workspaceId)
    : await checkFreemiumMeter(db, userId, meter, qty, body.workspaceId);

  if (!result.allowed) {
    return NextResponse.json(freemiumDeniedResponse(result), { status: 429 });
  }

  return NextResponse.json({ ok: true, ...result });
}

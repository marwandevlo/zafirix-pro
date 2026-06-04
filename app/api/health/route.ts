import { NextResponse } from 'next/server';
import { buildHealthSnapshot } from '@/app/lib/atlas-health-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = buildHealthSnapshot();
  return NextResponse.json(snapshot, {
    status: snapshot.status === 'down' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

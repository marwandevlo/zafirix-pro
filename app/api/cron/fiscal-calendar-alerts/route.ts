import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { scanAndAlertTaxDeadlines } from '@/app/lib/atlas-tax-calendar-server';

const MAX_COMPANIES_PER_RUN = 200;

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

/** Daily fiscal deadline scan — WhatsApp/email to managers & accountants. */
export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: false, error: 'not_enabled' }, { status: 400 });
  }
  if (!verifyCron(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: companies } = await admin
    .from('atlas_companies')
    .select('id, user_id')
    .eq('is_active', true)
    .neq('status', 'archived')
    .limit(MAX_COMPANIES_PER_RUN);

  let synced = 0;
  let alerted = 0;

  for (const co of companies ?? []) {
    try {
      const result = await scanAndAlertTaxDeadlines(admin, String(co.user_id), String(co.id));
      synced += result.synced;
      alerted += result.alerted;
    } catch {
      /* continue next company */
    }
  }

  return NextResponse.json({ ok: true, companies: (companies ?? []).length, synced, alerted });
}

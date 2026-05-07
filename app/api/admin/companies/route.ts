import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';

function pickCompanyName(companyJson: unknown): string {
  if (!companyJson || typeof companyJson !== 'object') return '';
  const obj = companyJson as Record<string, unknown>;
  const name = obj.name ?? obj.companyName ?? obj.legalName ?? obj.raisonSociale ?? '';
  return typeof name === 'string' ? name : '';
}

export async function GET(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          companies: [],
          warning: 'SUPABASE_SERVICE_ROLE_KEY not set; companies list requires privileged access.',
        },
        { status: 200 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    type CompanyRow = { id: string; user_id: string | null; company_json: unknown; created_at: string | null };
    const { data: companies, error } = await supabaseAdmin
      .from('atlas_companies')
      .select('id, user_id, company_json, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

    const companyRows = (companies ?? []) as CompanyRow[];

    // Optional: infer a plan from the user's latest subscription.
    const userIds = Array.from(new Set(companyRows.map((c) => String(c.user_id ?? '')).filter(Boolean)));

    type SubRow = { user_id: string | null; plan_id: string | null; status: string | null; created_at: string | null };
    const { data: subs } = await supabaseAdmin
      .from('atlas_subscriptions')
      .select('user_id, plan_id, status, created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false });

    const latestByUser = new Map<string, { plan_id: string; status: string }>();
    for (const s of (subs ?? []) as SubRow[]) {
      const uid = String(s.user_id ?? '');
      if (!uid || latestByUser.has(uid)) continue;
      latestByUser.set(uid, { plan_id: String(s.plan_id ?? ''), status: String(s.status ?? '') });
    }

    return NextResponse.json({
      companies: companyRows.map((c) => {
        const uid = String(c.user_id ?? '');
        const snap = latestByUser.get(uid);
        return {
          id: String(c.id),
          userId: uid,
          name: pickCompanyName(c.company_json),
          createdAt: String(c.created_at ?? ''),
          planId: snap?.plan_id,
        };
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur';
    return NextResponse.json({ error: 'server_error', message }, { status: 500 });
  }
}


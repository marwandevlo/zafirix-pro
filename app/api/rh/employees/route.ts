import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';
import { seedEmployeeCompliance } from '@/app/lib/atlas-hr-compliance-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim();
  if (!companyId) {
    return NextResponse.json({ error: 'company_required' }, { status: 400 });
  }

  const { data, error } = await ctx.db
    .from('atlas_employees')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employees: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => ({}))) as {
    companyId?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    roleTitle?: string;
    cin?: string;
    cnssMatricule?: string;
    grossSalaryMad?: number;
    hireDate?: string;
  };

  const companyId = String(body.companyId ?? '').trim();
  const fullName = String(body.fullName ?? '').trim();
  if (!companyId || !fullName) {
    return NextResponse.json({ error: 'company_and_name_required' }, { status: 400 });
  }

  const owned = await ctx.db
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (!owned.data) return NextResponse.json({ error: 'company_not_found' }, { status: 404 });

  const { data, error } = await ctx.db
    .from('atlas_employees')
    .insert({
      user_id: ctx.userId,
      company_id: companyId,
      full_name: fullName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      role_title: body.roleTitle ?? null,
      cin: body.cin ?? null,
      cnss_matricule: body.cnssMatricule ?? null,
      gross_salary_mad: body.grossSalaryMad ?? null,
      hire_date: body.hireDate ?? null,
      status: 'active',
      metadata: {},
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const admin = getSupabaseServiceRoleClient();
    await seedEmployeeCompliance(admin, ctx.userId, companyId, data.id);
  } catch {
    // Compliance tables may not be migrated yet — employee creation still succeeds.
  }

  return NextResponse.json({ employee: data });
}

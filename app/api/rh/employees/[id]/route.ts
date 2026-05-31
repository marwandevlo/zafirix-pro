import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(_request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await params;
  const { error } = await ctx.db.from('atlas_employees').delete().eq('id', id).eq('user_id', ctx.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.fullName != null) patch.full_name = String(body.fullName).trim();
  if (body.email != null) patch.email = String(body.email);
  if (body.phone != null) patch.phone = String(body.phone);
  if (body.roleTitle != null) patch.role_title = String(body.roleTitle);
  if (body.status != null) patch.status = String(body.status);
  if (body.cin != null) patch.cin = String(body.cin);
  if (body.cnssMatricule != null) patch.cnss_matricule = String(body.cnssMatricule);
  if (body.grossSalaryMad != null) patch.gross_salary_mad = Number(body.grossSalaryMad);
  if (body.hireDate != null) patch.hire_date = String(body.hireDate);

  const { data, error } = await ctx.db
    .from('atlas_employees')
    .update(patch)
    .eq('id', id)
    .eq('user_id', ctx.userId)
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ employee: data });
}

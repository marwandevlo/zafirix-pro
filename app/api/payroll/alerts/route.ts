/**
 * GET /api/payroll/alerts
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();
  const alerts: { id: string; severity: string; category: string; title: string; description: string }[] = [];

  const { data: payslips } = await admin
    .from('atlas_payslip_extractions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  const seen = new Map<string, number>();
  for (const p of payslips ?? []) {
    const key = `${p.employee_name}-${p.period_year}-${p.period_month}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      alerts.push({
        id: `dup-${key}`,
        severity: 'orange',
        category: 'Bulletin en double',
        title: 'Bulletin dupliqué détecté',
        description: `${count} bulletins pour la même période`,
      });
    }
  }

  for (const p of payslips ?? []) {
    if (!p.cnss_number && !p.employee_id) {
      alerts.push({
        id: `cnss-${p.id}`,
        severity: 'yellow',
        category: 'CNSS manquant',
        title: `CNSS absent — ${p.employee_name ?? 'Employé inconnu'}`,
        description: 'Numéro CNSS non extrait ni associé',
      });
    }
    if (!p.employee_id && (p.match_confidence ?? 0) < 75) {
      alerts.push({
        id: `emp-${p.id}`,
        severity: 'red',
        category: 'Employé non trouvé',
        title: `Employé introuvable — ${p.employee_name ?? '?'}`,
        description: `Confiance matching: ${p.match_confidence ?? 0}%`,
      });
    }
    if (p.gross_salary && p.net_salary) {
      const variation = Math.abs(Number(p.gross_salary) - Number(p.net_salary)) / Number(p.gross_salary);
      if (variation > 0.25) {
        alerts.push({
          id: `var-${p.id}`,
          severity: 'orange',
          category: 'Variation salariale',
          title: `Écart brut/net > 25% — ${p.employee_name}`,
          description: `Brut ${p.gross_salary} · Net ${p.net_salary}`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, alerts: alerts.slice(0, 25), total: alerts.length });
}

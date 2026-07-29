import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

  const admin = getSupabaseServiceRoleClient();
  const { data: pass, error } = await admin
    .from('zafirix_auditor_passes')
    .select('*')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !pass) return NextResponse.json({ error: 'invalid_token' }, { status: 404 });
  if (new Date(pass.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  await admin
    .from('zafirix_auditor_passes')
    .update({ access_count: (pass.access_count ?? 0) + 1 })
    .eq('id', pass.id);

  const companyId = pass.company_id as string | null;

  const [invoices, documents, legalDocs] = await Promise.all([
    companyId
      ? admin.from('atlas_invoices').select('id, number, client_name, total_ttc, status, due_date').eq('company_id', companyId).limit(50)
      : Promise.resolve({ data: [] }),
    companyId
      ? admin.from('atlas_documents').select('id, filename, document_type, created_at').eq('company_id', companyId).limit(30)
      : Promise.resolve({ data: [] }),
    companyId
      ? admin.from('zafirix_legal_documents').select('id, title, expiry_date, document_type').eq('company_id', companyId).limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  return NextResponse.json({
    ok: true,
    pass: {
      label: pass.label,
      scope: pass.scope,
      expiresAt: pass.expires_at,
    },
    summary: {
      invoiceCount: invoices.data?.length ?? 0,
      documentCount: documents.data?.length ?? 0,
      contractCount: legalDocs.data?.length ?? 0,
    },
    invoices: invoices.data ?? [],
    documents: documents.data ?? [],
    contracts: legalDocs.data ?? [],
  });
}

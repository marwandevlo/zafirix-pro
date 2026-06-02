/**
 * GET /api/legal/contracts
 *
 * Returns legal contracts with computed expiry status.
 * Supports: ?status=all|active|expiring|expired
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ContractStatus = 'active' | 'expiring' | 'expired';

function contractStatus(expiryDate: string | null): ContractStatus {
  if (!expiryDate) return 'active';
  const today = new Date();
  const expiry = new Date(expiryDate);
  if (expiry < today) return 'expired';
  const alert = new Date();
  alert.setDate(alert.getDate() + 30);
  if (expiry <= alert) return 'expiring';
  return 'active';
}

function daysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status') ?? 'all';
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10));

  const admin = getSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from('zafirix_legal_documents')
    .select('id, title, document_type, parties, expiry_date, source_document_id, created_at, metadata')
    .eq('user_id', userId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contracts = (data ?? []).map(row => {
    const status = contractStatus(row.expiry_date as string | null);
    return {
      id: row.id,
      title: row.title ?? 'Contrat sans titre',
      document_type: row.document_type ?? 'contract',
      parties: row.parties ?? null,
      expiry_date: row.expiry_date ?? null,
      days_until_expiry: daysUntilExpiry(row.expiry_date as string | null),
      status,
      source_document_id: row.source_document_id ?? null,
      created_at: row.created_at,
      metadata: row.metadata ?? null,
    };
  });

  const filtered = statusFilter === 'all'
    ? contracts
    : contracts.filter(c => c.status === statusFilter);

  return NextResponse.json({
    ok: true,
    contracts: filtered,
    summary: {
      active: contracts.filter(c => c.status === 'active').length,
      expiring: contracts.filter(c => c.status === 'expiring').length,
      expired: contracts.filter(c => c.status === 'expired').length,
      total: contracts.length,
    },
  });
}

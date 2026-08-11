import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type SearchHit = {
  type: 'invoice' | 'company' | 'document' | 'employee';
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
};

type DocumentSearchRow = {
  id: string;
  title: string;
  type?: string | null;
  kind?: string | null;
  source?: string | null;
};

function requireBearer(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ hits: [] satisfies SearchHit[] });

  const token = requireBearer(request);
  if (!token) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const like = `%${q}%`;

  const [invRes, docRes, empRes, compRes] = await Promise.all([
    supabase
      .from('atlas_invoices')
      .select('id, number, client_name, issue_date, due_date, total_ttc, status')
      .or(`number.ilike.${like},client_name.ilike.${like}`)
      .limit(15),
    supabase
      .from('atlas_documents')
      .select('id, title, type, kind, source, status, created_at')
      .ilike('title', like)
      .limit(10),
    supabase
      .from('atlas_employees')
      .select('id, full_name, role_title, status')
      .or(`full_name.ilike.${like},role_title.ilike.${like}`)
      .limit(10),
    supabase
      .from('atlas_companies')
      .select('id, name, legal_name, trade_name, company_json')
      .or(`name.ilike.${like},legal_name.ilike.${like},trade_name.ilike.${like}`)
      .limit(20),
  ]);

  if (invRes.error || docRes.error || empRes.error || compRes.error) {
    const msg =
      invRes.error?.message ??
      docRes.error?.message ??
      empRes.error?.message ??
      compRes.error?.message ??
      'search_failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const hits: SearchHit[] = [];

  for (const r of invRes.data ?? []) {
    hits.push({
      type: 'invoice',
      id: String(r.id),
      title: String(r.number),
      subtitle: `${r.client_name ?? ''} · Échéance ${r.due_date ?? ''} · ${Math.round(Number(r.total_ttc ?? 0)).toLocaleString()} MAD`,
      href: '/factures',
    });
  }

  for (const r of (docRes.data ?? []) as DocumentSearchRow[]) {
    hits.push({
      type: 'document',
      id: String(r.id),
      title: String(r.title),
      subtitle: `${r.type ?? r.kind ?? 'document'} · ${r.source ?? ''}`,
      href: '/documents',
    });
  }

  for (const r of empRes.data ?? []) {
    hits.push({
      type: 'employee',
      id: String(r.id),
      title: String(r.full_name),
      subtitle: `${r.role_title ?? ''}`.trim() || undefined,
      href: '/rh',
    });
  }

  for (const r of compRes.data ?? []) {
    const j = (r.company_json as Record<string, unknown> | null) ?? {};
    const name = String(
      r.trade_name ?? r.legal_name ?? r.name ?? (typeof j.raisonSociale === 'string' ? j.raisonSociale : '') ?? '',
    );
    const ifFiscal = typeof j.if_fiscal === 'string' ? j.if_fiscal : '';
    const city = typeof j.ville === 'string' ? j.ville : '';
    hits.push({
      type: 'company',
      id: String(r.id),
      title: name || 'Société',
      subtitle: [ifFiscal ? `IF ${ifFiscal}` : null, city || null].filter(Boolean).join(' · ') || undefined,
      href: '/companies',
    });
  }

  return NextResponse.json({ hits });
}


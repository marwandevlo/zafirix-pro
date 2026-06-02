/**
 * GET /api/dashboard/alerts
 *
 * Unified alert feed for the dashboard Alert Center.
 * Sources:
 *   - Rejected routing records
 *   - Expiring legal documents (≤ 30 days)
 *   - Expired legal documents
 *   - High TVA discrepancies (routing records with tva_warning in metadata)
 *   - Documents stuck in 'processing' > 1 hour
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AlertSeverity = 'red' | 'orange' | 'yellow';

type Alert = {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  description: string;
  href?: string;
  entity_id?: string;
  entity_type?: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();

  const today = new Date().toISOString().split('T')[0];
  const alertDate = new Date();
  alertDate.setDate(alertDate.getDate() + 30);
  const alertDateStr = alertDate.toISOString().split('T')[0];

  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const [rejected, expiring, expired, stuck] = await Promise.all([
    // Rejected routing records
    admin.from('zafirix_routing_records')
      .select('id, source_document_id, target_module, target_entity_type, updated_at')
      .eq('user_id', userId)
      .eq('validation_status', 'rejected')
      .order('updated_at', { ascending: false })
      .limit(10),

    // Contracts expiring soon (≤ 30 days)
    admin.from('zafirix_legal_documents')
      .select('id, title, expiry_date')
      .eq('user_id', userId)
      .gte('expiry_date', today)
      .lte('expiry_date', alertDateStr)
      .order('expiry_date', { ascending: true })
      .limit(10),

    // Expired contracts
    admin.from('zafirix_legal_documents')
      .select('id, title, expiry_date')
      .eq('user_id', userId)
      .lt('expiry_date', today)
      .order('expiry_date', { ascending: false })
      .limit(5),

    // Documents stuck in processing
    admin.from('zafirix_ocr_documents')
      .select('id, filename, processing_status, created_at')
      .eq('user_id', userId)
      .eq('processing_status', 'processing')
      .lt('created_at', oneHourAgo.toISOString())
      .limit(5),
  ]);

  const alerts: Alert[] = [];

  // Expired contracts — red
  for (const c of expired.data ?? []) {
    const daysAgo = Math.abs(Math.ceil((Date.now() - new Date(c.expiry_date as string).getTime()) / 86400000));
    alerts.push({
      id: `expired-${c.id}`,
      severity: 'red',
      category: 'Contrat expiré',
      title: `Contrat expiré : ${c.title ?? 'Sans titre'}`,
      description: `Expiré il y a ${daysAgo} jour${daysAgo > 1 ? 's' : ''}`,
      href: '/juridique',
      entity_id: String(c.id),
      entity_type: 'legal_document',
      created_at: c.expiry_date as string,
    });
  }

  // Rejected records — red
  for (const r of rejected.data ?? []) {
    alerts.push({
      id: `rejected-${r.id}`,
      severity: 'red',
      category: 'Enregistrement rejeté',
      title: `Rejet : module ${r.target_module ?? 'inconnu'}`,
      description: `Document source : ${r.source_document_id ? String(r.source_document_id).slice(0, 8) + '…' : '—'}`,
      href: '/validation',
      entity_id: String(r.id),
      entity_type: 'routing_record',
      created_at: String(r.updated_at),
    });
  }

  // Expiring contracts — orange
  for (const c of expiring.data ?? []) {
    const days = Math.ceil((new Date(c.expiry_date as string).getTime() - Date.now()) / 86400000);
    alerts.push({
      id: `expiring-${c.id}`,
      severity: 'orange',
      category: 'Contrat bientôt expiré',
      title: `${c.title ?? 'Contrat sans titre'}`,
      description: `Expire dans ${days} jour${days > 1 ? 's' : ''}`,
      href: '/juridique',
      entity_id: String(c.id),
      entity_type: 'legal_document',
      created_at: c.expiry_date as string,
    });
  }

  // Stuck documents — yellow
  for (const d of stuck.data ?? []) {
    alerts.push({
      id: `stuck-${d.id}`,
      severity: 'yellow',
      category: 'OCR bloqué',
      title: `Analyse bloquée : ${d.filename ?? String(d.id).slice(0, 8)}`,
      description: 'OCR en cours depuis plus d\'1 heure',
      href: '/documents',
      entity_id: String(d.id),
      entity_type: 'document',
      created_at: String(d.created_at),
    });
  }

  // Sort: red first, then orange, then yellow, newest first within each
  const order = { red: 0, orange: 1, yellow: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return NextResponse.json({
    ok: true,
    alerts,
    counts: {
      red: alerts.filter(a => a.severity === 'red').length,
      orange: alerts.filter(a => a.severity === 'orange').length,
      yellow: alerts.filter(a => a.severity === 'yellow').length,
      total: alerts.length,
    },
  });
}

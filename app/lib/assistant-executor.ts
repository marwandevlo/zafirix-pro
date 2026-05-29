import { addDaysYmd, todayYmd } from '@/app/lib/atlas-dates';
import type { AtlasAssistantAction } from '@/app/components/assistant/assistant-types';
import type { AtlasInvoice } from '@/app/types/atlas-invoice';
import { normalizePaymentTerms } from '@/app/types/atlas-payment-terms';
import { upsertAtlasInvoice } from '@/app/lib/atlas-invoices-repository';
import type { AtlasPayment } from '@/app/types/atlas-payment';
import { upsertAtlasPayment } from '@/app/lib/atlas-payments-repository';
import type { AtlasClient } from '@/app/types/atlas-client';
import { upsertAtlasClient } from '@/app/lib/atlas-clients-repository';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { createAtlasLink } from '@/app/lib/atlas-links-repository';

type ExecOk = { ok: true; message: string };
type ExecErr = { ok: false; error: string };

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

export async function executeAssistantAction(action: AtlasAssistantAction): Promise<ExecOk | ExecErr> {
  const data = obj(action.data) ?? {};

  if (action.action === 'create_invoice') {
    const clientName = str(data.clientName ?? data.client ?? data.customer) ?? '';
    const number = str(data.number ?? data.invoiceNumber) ?? `F-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;
    const issueDate = str(data.issueDate ?? data.dateEmission ?? data.date) ?? todayYmd();
    const amountHT = num(data.amountHT ?? data.ht ?? data.montantHT) ?? 0;
    const vatRatePct = num(data.vatRate ?? data.tvaRate ?? data.tauxTva) ?? 20;
    const vatRate = vatRatePct > 1 ? vatRatePct / 100 : vatRatePct;
    const vatAmount = amountHT * vatRate;
    const totalTTC = amountHT + vatAmount;
    const paymentTermsDays = Math.max(0, Math.trunc(num(data.paymentTermsDays ?? data.delaiPaiementJours ?? data.delai) ?? 30));
    const dueDate = str(data.dueDate ?? data.dateEcheance) ?? addDaysYmd(issueDate, paymentTermsDays);

    const nowIso = new Date().toISOString();
    const invoice: AtlasInvoice = {
      id: crypto.randomUUID(),
      number,
      clientName,
      issueDate,
      paymentTerms: normalizePaymentTerms({ kind: 'custom', days: paymentTermsDays }),
      dueDate,
      status: 'sent',
      amountHT,
      vatRate,
      vatAmount,
      totalTTC,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const res = await upsertAtlasInvoice(invoice);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, message: `Facture créée: ${invoice.number}` };
  }

  if (action.action === 'add_payment') {
    const invoiceId = str(data.invoiceId ?? data.id ?? data.invoice_id);
    if (!invoiceId) return { ok: false, error: 'invoiceId_required' };
    const paidAmount = num(data.paidAmount ?? data.amount ?? data.montantPaye) ?? 0;
    if (paidAmount <= 0) return { ok: false, error: 'paidAmount_invalid' };
    const paidAt = str(data.paidAt ?? data.datePaiement) ?? todayYmd();

    const payment: AtlasPayment = {
      id: crypto.randomUUID(),
      invoiceId,
      paidAmount,
      paidAt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await upsertAtlasPayment(payment);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, message: `Paiement ajouté: ${Math.round(paidAmount).toLocaleString()} MAD` };
  }

  if (action.action === 'create_client') {
    const name = str(data.name ?? data.clientName) ?? '';
    if (!name) return { ok: false, error: 'name_required' };
    const paymentTermsDays = Math.max(0, Math.trunc(num(data.paymentTermsDays ?? data.delaiPaiementJours ?? data.delai) ?? 30));
    const balance = num(data.balance ?? data.balanceMad) ?? 0;
    const nowIso = new Date().toISOString();

    const client: AtlasClient = {
      id: crypto.randomUUID(),
      name,
      email: str(data.email),
      phone: str(data.phone),
      address: str(data.address),
      city: str(data.city),
      paymentTerms: normalizePaymentTerms({ kind: 'custom', days: paymentTermsDays }),
      balance,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const companyId = await getActiveCompanyDbRowId();
    if (!companyId) return { ok: false, error: 'company_required' };

    const res = await upsertAtlasClient(client, { companyId });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, message: `Client créé: ${client.name}` };
  }

  if (action.action === 'link_entity') {
    const fromType = str(data.fromType);
    const fromId = str(data.fromId);
    const toType = str(data.toType);
    const toId = str(data.toId);
    const relation = str(data.relation) ?? 'relates_to';
    if (!fromType || !fromId || !toType || !toId) return { ok: false, error: 'link_fields_required' };

    const companyId =
      typeof data.companyId === 'string' || data.companyId === null ? (data.companyId as string | null) : null;
    const res = await createAtlasLink({
      fromType,
      fromId,
      toType,
      toId,
      relation,
      metadata: obj(data.metadata),
      companyId,
    });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, message: `Lien créé (${relation})` };
  }

  if (action.action === 'search') {
    return { ok: true, message: 'Recherche proposée (utilisez Ctrl+K).' };
  }

  return { ok: false, error: 'unsupported_action' };
}


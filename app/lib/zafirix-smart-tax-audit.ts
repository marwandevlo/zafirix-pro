/**
 * Smart Tax Audit — payload + company scan against Moroccan fiscal rules.
 * ICE (15 digits), TVA brackets, RAS/withholding, auto-entrepreneur ceilings.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isValidIce,
  isValidMoroccoVatRate,
  MOROCCO_TVA_RATES,
} from '@/app/lib/atlas-morocco-compliance';
import { AE_ACTIVITY_CEILINGS, type AeActivityType } from '@/app/types/atlas-individual-tax';
import type {
  MoroccoComplianceAuditResult,
  MoroccoComplianceFinding,
} from '@/app/types/zafirix-compliance-audit';
import { runMoroccoComplianceAudit } from '@/app/lib/zafirix-compliance-audit-server';

export const SMART_TAX_AUDIT_ENGINE = 'zafirix-smart-tax-audit-v1';

/** Common Moroccan withholding (RAS) rates (%). */
export const MOROCCO_RAS_RATES = [0, 10, 15, 17, 20] as const;

export type SmartTaxInvoicePayload = {
  id?: string;
  number?: string;
  clientName?: string;
  ice?: string | null;
  vatRate?: number | null;
  amountHt?: number;
  vatAmount?: number;
  totalTtc?: number;
};

export type SmartTaxLedgerPayload = {
  id?: string;
  label?: string;
  debit?: number;
  credit?: number;
  ice?: string | null;
  withholdingRate?: number | null;
};

export type SmartTaxAuditPayload = {
  companyId?: string;
  companyIce?: string | null;
  invoices?: SmartTaxInvoicePayload[];
  ledger?: SmartTaxLedgerPayload[];
  aeTurnoverMad?: number;
  aeCeilingMad?: number;
  aeActivity?: AeActivityType;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function vatPct(rate: number | null | undefined, ht: number, vat: number): number | null {
  if (typeof rate === 'number' && Number.isFinite(rate)) {
    return rate <= 1 ? round2(rate * 100) : round2(rate);
  }
  if (ht > 0 && vat >= 0) return round2((vat / ht) * 100);
  return null;
}

function isValidRasRate(pct: number): boolean {
  return (MOROCCO_RAS_RATES as readonly number[]).includes(pct);
}

function scoreFromFindings(findings: MoroccoComplianceFinding[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.severity === 'critical') score -= 12;
    else if (f.severity === 'warning') score -= 6;
    else score -= 2;
  }
  return Math.max(0, Math.min(100, score));
}

function bandFromScore(score: number): MoroccoComplianceAuditResult['band'] {
  if (score >= 80) return 'healthy';
  if (score >= 55) return 'attention';
  return 'critical';
}

function mergeFindings(
  a: MoroccoComplianceFinding[],
  b: MoroccoComplianceFinding[],
): MoroccoComplianceFinding[] {
  const seen = new Set<string>();
  const out: MoroccoComplianceFinding[] = [];
  for (const f of [...a, ...b]) {
    const key = `${f.code}:${f.entityId ?? ''}:${f.entityLabel ?? ''}:${f.messageFr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

export function auditSmartTaxPayload(
  payload: SmartTaxAuditPayload,
  companyId = payload.companyId?.trim() || 'payload',
): MoroccoComplianceAuditResult {
  const findings: MoroccoComplianceFinding[] = [];
  let seq = 0;
  const push = (f: Omit<MoroccoComplianceFinding, 'id'>) => {
    seq += 1;
    findings.push({ ...f, id: `${f.code}-${seq}` });
  };

  const companyIce = payload.companyIce?.trim() ?? '';
  if (companyIce && !isValidIce(companyIce)) {
    push({
      code: 'company_ice_invalid',
      severity: 'critical',
      titleFr: 'ICE société invalide',
      titleAr: 'رقم ICE غير صالح',
      messageFr: `L’ICE « ${companyIce.slice(0, 20)} » n’est pas conforme (15 chiffres DGI).`,
      messageAr: 'رقم ICE لا يطابق معيار DGI (15 رقماً).',
      recommendationFr: 'Corrigez l’ICE (exactement 15 chiffres, sans espaces).',
      recommendationAr: 'صحّحوا رقم ICE (15 رقماً بالضبط بدون فراغات).',
      entityType: 'company',
      entityId: companyId,
    });
  }

  const invoices = payload.invoices ?? [];
  for (const inv of invoices) {
    const label = inv.number || inv.clientName || inv.id || 'facture';
    const ice = inv.ice?.trim() ?? '';
    if (ice && !isValidIce(ice)) {
      push({
        code: 'invoice_client_ice_invalid',
        severity: 'warning',
        titleFr: 'ICE client invalide',
        titleAr: 'ICE الزبون غير صالح',
        messageFr: `Facture ${label} : ICE « ${ice} » invalide.`,
        messageAr: `الفاتورة ${label}: رقم ICE غير صالح.`,
        recommendationFr: 'ICE client = 15 chiffres (norme DGI).',
        recommendationAr: 'ICE الزبون يجب أن يكون 15 رقماً.',
        entityType: 'invoice',
        entityId: inv.id ?? null,
        entityLabel: label,
      });
    }

    const ht = Number(inv.amountHt ?? 0);
    const vat = Number(inv.vatAmount ?? 0);
    const ttc = Number(inv.totalTtc ?? 0);
    const pct = vatPct(inv.vatRate, ht, vat);
    if (pct !== null && !isValidMoroccoVatRate(pct)) {
      push({
        code: 'invoice_vat_rate_invalid',
        severity: 'critical',
        titleFr: 'Taux TVA hors barème marocain',
        titleAr: 'نسبة TVA خارج الجدول المغربي',
        messageFr: `Facture ${label} : ${pct}% — barème ${MOROCCO_TVA_RATES.filter((r) => r > 0).join('/')} %.`,
        messageAr: `الفاتورة ${label}: ${pct}٪ خارج 0/7/10/14/20٪.`,
        recommendationFr: 'Utilisez 0, 7, 10, 14 ou 20 % uniquement.',
        recommendationAr: 'استعملوا فقط 0 أو 7 أو 10 أو 14 أو 20٪.',
        entityType: 'invoice',
        entityId: inv.id ?? null,
        entityLabel: label,
        meta: { vatPct: pct },
      });
    }
    if (ht > 0 && ttc > 0 && Math.abs(round2(ht + vat) - round2(ttc)) > 0.05) {
      push({
        code: 'invoice_amount_mismatch',
        severity: 'critical',
        titleFr: 'Montants HT / TVA / TTC incohérents',
        titleAr: 'مبالغ غير متسقة',
        messageFr: `Facture ${label} : HT ${ht} + TVA ${vat} ≠ TTC ${ttc}.`,
        messageAr: `الفاتورة ${label}: HT + TVA ≠ TTC.`,
        recommendationFr: 'Recalculez TTC = HT + TVA (tolérance 0,05 MAD).',
        recommendationAr: 'أعيدوا احتساب TTC = HT + TVA.',
        entityType: 'invoice',
        entityId: inv.id ?? null,
        entityLabel: label,
      });
    }
  }

  const ledger = payload.ledger ?? [];
  let debit = 0;
  let credit = 0;
  for (const row of ledger) {
    debit += Number(row.debit ?? 0);
    credit += Number(row.credit ?? 0);
    const ice = row.ice?.trim() ?? '';
    if (ice && !isValidIce(ice)) {
      push({
        code: 'supplier_ice_invalid',
        severity: 'warning',
        titleFr: 'ICE écriture invalide',
        titleAr: 'ICE القيد غير صالح',
        messageFr: `Écriture « ${row.label || row.id || '—'} » : ICE invalide.`,
        messageAr: 'رقم ICE في القيد غير مطابق.',
        recommendationFr: 'ICE 15 chiffres sur le tiers.',
        recommendationAr: 'ICE الطرف يجب أن يكون 15 رقماً.',
        entityType: 'accounting',
        entityId: row.id ?? null,
        entityLabel: row.label ?? null,
      });
    }
    if (row.withholdingRate != null && Number.isFinite(row.withholdingRate)) {
      const ras = row.withholdingRate <= 1 ? round2(row.withholdingRate * 100) : round2(row.withholdingRate);
      if (!isValidRasRate(ras)) {
        push({
          code: 'ras_rate_invalid',
          severity: 'warning',
          titleFr: 'Taux RAS / retenue à la source atypique',
          titleAr: 'نسبة الاقتطاع من المصدر غير معتادة',
          messageFr: `Écriture « ${row.label || row.id} » : RAS ${ras}% (attendu 0/10/15/17/20 %).`,
          messageAr: `القيد: RAS ${ras}٪ — المتوقع 0/10/15/17/20٪.`,
          recommendationFr: 'Vérifiez la retenue à la source IR (honoraires, loyers, dividendes).',
          recommendationAr: 'تحققوا من الاقتطاع من المصدر (أتعاب، كراء، أرباح).',
          entityType: 'accounting',
          entityId: row.id ?? null,
          entityLabel: row.label ?? null,
          meta: { rasPct: ras },
        });
      }
    }
  }
  if (ledger.length > 0 && Math.abs(round2(debit) - round2(credit)) > 0.05) {
    push({
      code: 'accounting_unbalanced',
      severity: 'critical',
      titleFr: 'Journal non équilibré',
      titleAr: 'اليومية غير متوازنة',
      messageFr: `Débits ${round2(debit)} ≠ crédits ${round2(credit)} MAD.`,
      messageAr: 'مجموع المدين ≠ مجموع الدائن.',
      recommendationFr: 'Partie double PCGE : total débits = total crédits.',
      recommendationAr: 'القيد المزدوج: المدين = الدائن.',
      entityType: 'accounting',
    });
  }

  if (payload.aeTurnoverMad != null) {
    const activity = payload.aeActivity ?? 'services';
    const ceiling = payload.aeCeilingMad || AE_ACTIVITY_CEILINGS[activity] || AE_ACTIVITY_CEILINGS.services;
    const ca = Number(payload.aeTurnoverMad);
    const ratio = ceiling > 0 ? ca / ceiling : 0;
    if (ratio >= 1) {
      push({
        code: 'ae_ceiling_exceeded',
        severity: 'critical',
        titleFr: 'Plafond auto-entrepreneur dépassé',
        titleAr: 'تجاوز سقف المقاول الذاتي',
        messageFr: `CA ${round2(ca)} MAD ≥ plafond ${ceiling} MAD.`,
        messageAr: 'رقم المعاملات تجاوز السقف السنوي.',
        recommendationFr: 'Anticipez un changement de régime avec votre expert-comptable.',
        recommendationAr: 'راجعوا النظام الضريبي مع محاسبكم.',
        entityType: 'ae_profile',
        meta: { ca, ceiling, ratio },
      });
    } else if (ratio >= 0.8) {
      push({
        code: 'ae_ceiling_near',
        severity: 'warning',
        titleFr: 'Plafond AE bientôt atteint',
        titleAr: 'اقتراب من سقف المقاول الذاتي',
        messageFr: `CA ${round2(ca)} / ${ceiling} MAD (${Math.round(ratio * 100)} %).`,
        messageAr: `تم استهلاك ${Math.round(ratio * 100)}٪ من السقف.`,
        recommendationFr: 'Surveillez le CA trimestriel.',
        recommendationAr: 'راقبوا رقم المعاملات الفصلي.',
        entityType: 'ae_profile',
        meta: { ca, ceiling, ratio },
      });
    }
  }

  const score = scoreFromFindings(findings);
  const band = bandFromScore(score);
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warning = findings.filter((f) => f.severity === 'warning').length;
  const info = findings.filter((f) => f.severity === 'info').length;

  return {
    companyId,
    scannedAt: new Date().toISOString(),
    score,
    band,
    counts: {
      critical,
      warning,
      info,
      invoicesScanned: invoices.length,
      supplierInvoicesScanned: 0,
      accountingEntriesScanned: ledger.length,
    },
    findings,
    summaryFr:
      findings.length === 0
        ? 'Payload conforme aux contrôles ICE, TVA, RAS et plafonds AE.'
        : `Audit payload : ${critical} critique(s), ${warning} alerte(s), score ${score}/100.`,
    summaryAr:
      findings.length === 0
        ? 'البيانات مطابقة لفحوصات ICE وTVA وRAS وأسقف المقاول الذاتي.'
        : `تدقيق البيانات: ${critical} حرج، ${warning} تنبيه، النقطة ${score}/100.`,
  };
}

export async function runSmartTaxAudit(opts: {
  db: SupabaseClient;
  userId: string;
  payload: SmartTaxAuditPayload;
}): Promise<MoroccoComplianceAuditResult> {
  const payloadAudit = auditSmartTaxPayload(opts.payload);
  const companyId = opts.payload.companyId?.trim();
  if (!companyId) return payloadAudit;

  const dbAudit = await runMoroccoComplianceAudit(opts.db, {
    userId: opts.userId,
    companyId,
  });

  const findings = mergeFindings(dbAudit.findings, payloadAudit.findings);
  const score = scoreFromFindings(findings);
  const band = bandFromScore(score);
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warning = findings.filter((f) => f.severity === 'warning').length;
  const info = findings.filter((f) => f.severity === 'info').length;

  return {
    companyId,
    scannedAt: new Date().toISOString(),
    score,
    band,
    counts: {
      critical,
      warning,
      info,
      invoicesScanned: dbAudit.counts.invoicesScanned + payloadAudit.counts.invoicesScanned,
      supplierInvoicesScanned: dbAudit.counts.supplierInvoicesScanned,
      accountingEntriesScanned:
        dbAudit.counts.accountingEntriesScanned + payloadAudit.counts.accountingEntriesScanned,
    },
    findings,
    summaryFr:
      findings.length === 0
        ? 'Aucun écart majeur (ICE, TVA, RAS, plafonds AE). Validez avec votre expert-comptable.'
        : `Smart Tax Audit : ${critical} critique(s), ${warning} alerte(s), score ${score}/100.`,
    summaryAr:
      findings.length === 0
        ? 'لا توجد مخالفات جوهرية (ICE، TVA، RAS، أسقف المقاول الذاتي).'
        : `التدقيق الضريبي الذكي: ${critical} حرج، ${warning} تنبيه، النقطة ${score}/100.`,
  };
}

const AE_ACTIVITIES: readonly AeActivityType[] = ['services', 'commerce', 'industrie', 'artisanat'];

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function parseInvoice(row: unknown): SmartTaxInvoicePayload | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  return {
    id: asTrimmedString(r.id),
    number: asTrimmedString(r.number ?? r.invoiceNumber ?? r.ref),
    clientName: asTrimmedString(r.clientName ?? r.client),
    ice: asTrimmedString(r.ice ?? r.clientIce ?? r.client_ice) ?? null,
    vatRate: asFiniteNumber(r.vatRate ?? r.vat_rate ?? r.tvaRate) ?? null,
    amountHt: asFiniteNumber(r.amountHt ?? r.amount_ht ?? r.ht),
    vatAmount: asFiniteNumber(r.vatAmount ?? r.vat_amount ?? r.tva),
    totalTtc: asFiniteNumber(r.totalTtc ?? r.total_ttc ?? r.ttc),
  };
}

function parseLedger(row: unknown): SmartTaxLedgerPayload | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  return {
    id: asTrimmedString(r.id),
    label: asTrimmedString(r.label ?? r.libelle),
    debit: asFiniteNumber(r.debit),
    credit: asFiniteNumber(r.credit),
    ice: asTrimmedString(r.ice) ?? null,
    withholdingRate: asFiniteNumber(r.withholdingRate ?? r.rasRate ?? r.ras) ?? null,
  };
}

export function hasAuditablePayloadContent(payload: SmartTaxAuditPayload): boolean {
  return Boolean(
    payload.companyIce ||
      (payload.invoices && payload.invoices.length > 0) ||
      (payload.ledger && payload.ledger.length > 0) ||
      payload.aeTurnoverMad != null,
  );
}

/** Normalize a POST/GET body into a typed audit payload. */
export function parseSmartTaxAuditBody(raw: unknown): SmartTaxAuditPayload {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const activityRaw = asTrimmedString(body.aeActivity)?.toLowerCase();
  const aeActivity = AE_ACTIVITIES.includes(activityRaw as AeActivityType)
    ? (activityRaw as AeActivityType)
    : undefined;

  const invoicesRaw = Array.isArray(body.invoices) ? body.invoices : [];
  const ledgerRaw = Array.isArray(body.ledger) ? body.ledger : [];

  return {
    companyId: asTrimmedString(body.companyId),
    companyIce: asTrimmedString(body.companyIce) ?? null,
    invoices: invoicesRaw.map(parseInvoice).filter((r): r is SmartTaxInvoicePayload => r !== null),
    ledger: ledgerRaw.map(parseLedger).filter((r): r is SmartTaxLedgerPayload => r !== null),
    aeTurnoverMad: asFiniteNumber(body.aeTurnoverMad),
    aeCeilingMad: asFiniteNumber(body.aeCeilingMad),
    aeActivity,
  };
}

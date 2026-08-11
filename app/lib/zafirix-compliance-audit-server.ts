/**
 * Expert-Comptable Virtuel — rule-based Moroccan tax & accounting compliance scanner.
 * Validates TVA rates, ICE, CNSS presence, AE ceilings, and double-entry balance.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isValidIce,
  isValidMoroccoVatRate,
  MOROCCO_TVA_RATES,
} from '@/app/lib/atlas-morocco-compliance';
import { AE_ACTIVITY_CEILINGS } from '@/app/types/atlas-individual-tax';
import type {
  MoroccoComplianceAuditResult,
  MoroccoComplianceFinding,
} from '@/app/types/zafirix-compliance-audit';

const ENGINE = 'zafirix-ma-compliance-v1';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function vatPctFromInvoice(row: Record<string, unknown>): number | null {
  const rateCol = row.vat_rate;
  if (typeof rateCol === 'number' && Number.isFinite(rateCol)) {
    // DB may store 0.2 or 20
    return rateCol <= 1 ? round2(rateCol * 100) : round2(rateCol);
  }
  const json = row.invoice_json as Record<string, unknown> | null;
  if (json && typeof json.vatRate === 'number') {
    const r = json.vatRate;
    return r <= 1 ? round2(r * 100) : round2(r);
  }
  const ht = Number(row.amount_ht ?? 0);
  const vat = Number(row.vat_amount ?? row.tva_amount ?? 0);
  if (ht > 0 && vat >= 0) return round2((vat / ht) * 100);
  return null;
}

function clientIceFromInvoice(row: Record<string, unknown>): string | null {
  const json = (row.invoice_json ?? row.metadata) as Record<string, unknown> | null;
  if (!json) return null;
  const candidates = [
    json.clientIce,
    json.client_ice,
    json.ice,
    (json.client as Record<string, unknown> | undefined)?.ice,
    (json.metadata as Record<string, unknown> | undefined)?.clientIce,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function amountsConsistent(ht: number, vat: number, ttc: number, tolerance = 0.05): boolean {
  return Math.abs(round2(ht + vat) - round2(ttc)) <= tolerance;
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

export async function runMoroccoComplianceAudit(
  db: SupabaseClient,
  params: { userId: string; companyId: string; limitInvoices?: number },
): Promise<MoroccoComplianceAuditResult> {
  const { userId, companyId } = params;
  const limit = params.limitInvoices ?? 120;
  const findings: MoroccoComplianceFinding[] = [];
  let findingSeq = 0;
  const push = (f: Omit<MoroccoComplianceFinding, 'id'>) => {
    findingSeq += 1;
    findings.push({ ...f, id: `${f.code}-${findingSeq}` });
  };

  const [companyRes, invRes, supRes, accRes, aeProfileRes, aeTurnoverRes] = await Promise.all([
    db
      .from('atlas_companies')
      .select('id, ice, if_fiscal, rc, cnss_number, company_json, name, legal_name')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('atlas_invoices')
      .select(
        'id, number, client_name, amount_ht, vat_rate, vat_amount, total_ttc, status, invoice_json, metadata, issue_date',
      )
      .eq('company_id', companyId)
      .order('issue_date', { ascending: false })
      .limit(limit),
    db
      .from('atlas_supplier_invoices')
      .select('id, supplier_name, supplier_ice, amount_ht, tva_amount, total_ttc, invoice_date')
      .eq('company_id', companyId)
      .order('invoice_date', { ascending: false })
      .limit(limit),
    db
      .from('atlas_accounting_entries')
      .select('id, entry_json, entry_date')
      .eq('company_id', companyId)
      .order('entry_date', { ascending: false })
      .limit(200),
    db
      .from('zafirix_individual_profiles')
      .select('id, profile_type, activity_type, annual_ceiling_mad, fiscal_year, display_name')
      .eq('company_id', companyId)
      .eq('profile_type', 'auto_entrepreneur')
      .order('fiscal_year', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('zafirix_ae_turnover_entries')
      .select('amount_mad, fiscal_year')
      .eq('company_id', companyId),
  ]);

  const company = companyRes.data as Record<string, unknown> | null;
  const companyJson = (company?.company_json ?? {}) as Record<string, unknown>;
  const companyIce =
    (typeof company?.ice === 'string' && company.ice) ||
    (typeof companyJson.ice === 'string' && companyJson.ice) ||
    '';
  const cnss =
    (typeof company?.cnss_number === 'string' && company.cnss_number) ||
    (typeof companyJson.cnss === 'string' && companyJson.cnss) ||
    (typeof companyJson.cnss_number === 'string' && companyJson.cnss_number) ||
    '';

  if (!String(companyIce).trim()) {
    push({
      code: 'company_ice_missing',
      severity: 'critical',
      titleFr: 'ICE société manquant',
      titleAr: 'رقم ICE للشركة مفقود',
      messageFr: "Le profil de la société active n'a pas d'ICE renseigné.",
      messageAr: 'ملف الشركة النشطة لا يحتوي على رقم ICE.',
      recommendationFr:
        'Renseignez l’ICE (15 chiffres) dans Paramètres / Société — obligatoire pour SIMPL-TVA et facturation B2B.',
      recommendationAr: 'أدخل رقم ICE (15 رقماً) في إعدادات الشركة — مطلوب لـ SIMPL-TVA.',
      entityType: 'company',
      entityId: companyId,
    });
  } else if (!isValidIce(String(companyIce))) {
    push({
      code: 'company_ice_invalid',
      severity: 'critical',
      titleFr: 'ICE société invalide',
      titleAr: 'رقم ICE غير صالح',
      messageFr: `L’ICE « ${String(companyIce).slice(0, 20)} » n’est pas conforme (15 chiffres DGI).`,
      messageAr: 'رقم ICE لا يطابق معيار DGI (15 رقماً).',
      recommendationFr: 'Corrigez l’ICE dans le profil société (exactement 15 chiffres, sans espaces).',
      recommendationAr: 'صحّح رقم ICE في ملف الشركة (15 رقماً بالضبط).',
      entityType: 'company',
      entityId: companyId,
    });
  }

  if (!String(cnss).trim()) {
    push({
      code: 'company_cnss_missing',
      severity: 'warning',
      titleFr: 'N° CNSS non renseigné',
      titleAr: 'رقم CNSS غير مذكور',
      messageFr: 'Aucun numéro d’affiliation CNSS sur le profil société.',
      messageAr: 'لا يوجد رقم انخراط CNSS في ملف الشركة.',
      recommendationFr:
        'Si vous avez des salariés, ajoutez le N° CNSS pour les déclarations et bordereaux RH.',
      recommendationAr: 'إذا كان لديكم أجراء، أضيفوا رقم CNSS للتصاريح والرواتب.',
      entityType: 'company',
      entityId: companyId,
    });
  }

  const invoices = (invRes.data ?? []) as Record<string, unknown>[];
  for (const row of invoices) {
    if (String(row.status) === 'cancelled') continue;
    const id = String(row.id);
    const label = String(row.number || row.client_name || id);
    const ht = Number(row.amount_ht ?? 0);
    const vat = Number(row.vat_amount ?? 0);
    const ttc = Number(row.total_ttc ?? 0);
    const pct = vatPctFromInvoice(row);

    if (pct !== null && !isValidMoroccoVatRate(pct)) {
      push({
        code: 'invoice_vat_rate_invalid',
        severity: 'critical',
        titleFr: 'Taux TVA non conforme',
        titleAr: 'نسبة TVA غير مطابقة',
        messageFr: `Facture ${label} : taux ${pct}% hors barème marocain (${MOROCCO_TVA_RATES.filter((r) => r > 0).join('/')} %).`,
        messageAr: `الفاتورة ${label}: نسبة ${pct}% خارج المعدلات المغربية.`,
        recommendationFr: 'Corrigez le taux TVA (20, 14, 10, 7 ou 0 %) avant déclaration SIMPL-TVA.',
        recommendationAr: 'صحّحوا نسبة TVA (20 أو 14 أو 10 أو 7 أو 0٪) قبل التصريح.',
        entityType: 'invoice',
        entityId: id,
        entityLabel: label,
        meta: { vatPct: pct },
      });
    }

    if (ht > 0 && ttc > 0 && !amountsConsistent(ht, vat, ttc)) {
      push({
        code: 'invoice_amount_mismatch',
        severity: 'critical',
        titleFr: 'Montants HT / TVA / TTC incohérents',
        titleAr: 'مبالغ غير متسقة',
        messageFr: `Facture ${label} : HT ${ht} + TVA ${vat} ≠ TTC ${ttc}.`,
        messageAr: `الفاتورة ${label}: المبالغ HT وTVA وTTC غير متطابقة.`,
        recommendationFr: 'Recalculez TTC = HT + TVA (tolérance 0,05 MAD) et réenregistrez la facture.',
        recommendationAr: 'أعدوا احتساب TTC = HT + TVA ثم احفظوا الفاتورة.',
        entityType: 'invoice',
        entityId: id,
        entityLabel: label,
      });
    }

    const clientIce = clientIceFromInvoice(row);
    if (clientIce && !isValidIce(clientIce)) {
      push({
        code: 'invoice_client_ice_invalid',
        severity: 'warning',
        titleFr: 'ICE client invalide',
        titleAr: 'ICE الزبون غير صالح',
        messageFr: `Facture ${label} : ICE client « ${clientIce} » invalide.`,
        messageAr: `الفاتورة ${label}: رقم ICE للزبون غير صالح.`,
        recommendationFr: 'Vérifiez l’ICE client (15 chiffres) — requis pour le relevé de déduction côté acheteur.',
        recommendationAr: 'تحققوا من ICE الزبون (15 رقماً).',
        entityType: 'invoice',
        entityId: id,
        entityLabel: label,
      });
    }
  }

  const suppliers = (supRes.error ? [] : ((supRes.data ?? []) as Record<string, unknown>[]));
  for (const row of suppliers) {
    const id = String(row.id);
    const label = String(row.supplier_name || id);
    const ice = row.supplier_ice != null ? String(row.supplier_ice) : '';
    if (!ice.trim()) {
      push({
        code: 'supplier_ice_missing',
        severity: 'warning',
        titleFr: 'ICE fournisseur manquant',
        titleAr: 'ICE المورد مفقود',
        messageFr: `Facture fournisseur « ${label} » sans ICE.`,
        messageAr: `فاتورة المورد « ${label} » بدون ICE.`,
        recommendationFr: 'Complétez l’ICE fournisseur (15 chiffres) pour le relevé des achats SIMPL-TVA.',
        recommendationAr: 'أضيفوا ICE المورد (15 رقماً) لبيان المشتريات.',
        entityType: 'supplier_invoice',
        entityId: id,
        entityLabel: label,
      });
    } else if (!isValidIce(ice)) {
      push({
        code: 'supplier_ice_invalid',
        severity: 'critical',
        titleFr: 'ICE fournisseur invalide',
        titleAr: 'ICE المورد غير صالح',
        messageFr: `Fournisseur « ${label} » : ICE « ${ice} » non conforme.`,
        messageAr: `المورد « ${label} »: رقم ICE غير مطابق.`,
        recommendationFr: 'Corrigez l’ICE fournisseur avant export XML DGI.',
        recommendationAr: 'صحّحوا ICE المورد قبل تصدير XML.',
        entityType: 'supplier_invoice',
        entityId: id,
        entityLabel: label,
      });
    }

    const ht = Number(row.amount_ht ?? 0);
    const vat = Number(row.tva_amount ?? 0);
    const ttc = Number(row.total_ttc ?? 0);
    if (ht > 0 && ttc > 0 && !amountsConsistent(ht, vat, ttc)) {
      push({
        code: 'invoice_amount_mismatch',
        severity: 'warning',
        titleFr: 'Achat : montants incohérents',
        titleAr: 'شراء: مبالغ غير متسقة',
        messageFr: `Achat « ${label} » : HT+TVA ≠ TTC.`,
        messageAr: `الشراء « ${label} »: المبالغ غير متطابقة.`,
        recommendationFr: 'Vérifiez la saisie HT / TVA / TTC de la facture fournisseur.',
        recommendationAr: 'تحققوا من مبالغ فاتورة المورد.',
        entityType: 'supplier_invoice',
        entityId: id,
        entityLabel: label,
      });
    }
  }

  const entries = (accRes.error ? [] : ((accRes.data ?? []) as Record<string, unknown>[]));
  let debitSum = 0;
  let creditSum = 0;
  let unbalancedDocs = 0;
  const byDoc = new Map<string, { d: number; c: number }>();
  for (const row of entries) {
    const entry = (row.entry_json ?? {}) as Record<string, unknown>;
    const debit = Number(entry.debit ?? 0);
    const credit = Number(entry.credit ?? 0);
    debitSum += debit;
    creditSum += credit;
    const docKey = String(entry.documentId ?? entry.piece ?? entry.ref ?? row.id);
    const prev = byDoc.get(docKey) ?? { d: 0, c: 0 };
    prev.d += debit;
    prev.c += credit;
    byDoc.set(docKey, prev);
  }
  for (const [doc, bal] of byDoc) {
    if (Math.abs(round2(bal.d) - round2(bal.c)) > 0.05 && (bal.d > 0 || bal.c > 0)) {
      unbalancedDocs += 1;
      if (unbalancedDocs <= 5) {
        push({
          code: 'accounting_unbalanced',
          severity: 'critical',
          titleFr: 'Écriture non équilibrée',
          titleAr: 'قيد غير متوازن',
          messageFr: `Pièce « ${doc} » : débits ${round2(bal.d)} ≠ crédits ${round2(bal.c)} MAD.`,
          messageAr: `الورقة « ${doc} »: المدين ≠ الدائن.`,
          recommendationFr: 'Appliquez la partie double PCGE : total débits = total crédits.',
          recommendationAr: 'طبّقوا القيد المزدوج: مجموع المدين = مجموع الدائن.',
          entityType: 'accounting',
          entityId: doc,
        });
      }
    }
  }
  if (entries.length > 0 && Math.abs(round2(debitSum) - round2(creditSum)) > 0.5 && unbalancedDocs === 0) {
    push({
      code: 'accounting_unbalanced',
      severity: 'warning',
      titleFr: 'Journal global déséquilibré',
      titleAr: 'اليومية غير متوازنة',
      messageFr: `Somme débits ${round2(debitSum)} ≠ crédits ${round2(creditSum)} MAD sur l’échantillon scanné.`,
      messageAr: 'مجموع المدين والدائن غير متطابق في العينة المفحوصة.',
      recommendationFr: 'Contrôlez les dernières écritures en Comptabilité.',
      recommendationAr: 'راجعوا آخر القيود في المحاسبة.',
      entityType: 'accounting',
    });
  }

  const aeProfile = aeProfileRes.error ? null : (aeProfileRes.data as Record<string, unknown> | null);
  if (aeProfile) {
    const fiscalYear = Number(aeProfile.fiscal_year ?? new Date().getFullYear());
    const activity = String(aeProfile.activity_type ?? 'services') as keyof typeof AE_ACTIVITY_CEILINGS;
    const ceiling =
      Number(aeProfile.annual_ceiling_mad) ||
      AE_ACTIVITY_CEILINGS[activity] ||
      AE_ACTIVITY_CEILINGS.services;
    const turnoverRows = (aeTurnoverRes.error ? [] : (aeTurnoverRes.data ?? [])) as {
      amount_mad?: number;
      fiscal_year?: number;
    }[];
    const ca = turnoverRows
      .filter((r) => Number(r.fiscal_year) === fiscalYear)
      .reduce((s, r) => s + Number(r.amount_mad ?? 0), 0);
    const ratio = ceiling > 0 ? ca / ceiling : 0;
    if (ratio >= 1) {
      push({
        code: 'ae_ceiling_exceeded',
        severity: 'critical',
        titleFr: 'Plafond auto-entrepreneur dépassé',
        titleAr: 'تجاوز سقف المقاول الذاتي',
        messageFr: `CA ${round2(ca)} MAD ≥ plafond ${ceiling} MAD (${activity}, ${fiscalYear}).`,
        messageAr: `رقم المعاملات تجاوز السقف السنوي للمقاول الذاتي.`,
        recommendationFr:
          'Régularisez le statut fiscal (passage en société / personne physique) avec votre expert-comptable.',
        recommendationAr: 'راجعوا الوضع الضريبي مع محاسبكم (تغيير النظام).',
        entityType: 'ae_profile',
        entityId: String(aeProfile.id),
        meta: { ca, ceiling, ratio },
      });
    } else if (ratio >= 0.8) {
      push({
        code: 'ae_ceiling_near',
        severity: 'warning',
        titleFr: 'Plafond AE bientôt atteint',
        titleAr: 'اقتراب من سقف المقاول الذاتي',
        messageFr: `CA ${round2(ca)} / ${ceiling} MAD (${Math.round(ratio * 100)} %).`,
        messageAr: `تم استهلاك ${Math.round(ratio * 100)}٪ من السقف السنوي.`,
        recommendationFr: 'Surveillez le CA trimestriel et anticipez un changement de régime si besoin.',
        recommendationAr: 'راقبوا رقم المعاملات الفصلي واستعدوا لتغيير النظام إن لزم.',
        entityType: 'ae_profile',
        entityId: String(aeProfile.id),
        meta: { ca, ceiling, ratio },
      });
    }
  }

  const score = scoreFromFindings(findings);
  const band = bandFromScore(score);
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warning = findings.filter((f) => f.severity === 'warning').length;
  const info = findings.filter((f) => f.severity === 'info').length;

  const summaryFr =
    findings.length === 0
      ? 'Aucun écart majeur détecté sur l’échantillon scanné. Poursuivez les contrôles périodiques avec votre expert-comptable.'
      : `Audit terminé : ${critical} critique(s), ${warning} alerte(s), score ${score}/100. Priorisez les ICE et taux TVA avant export DGI.`;
  const summaryAr =
    findings.length === 0
      ? 'لم تُرصد مخالفات جوهرية في العينة. واصلوا المراقبة الدورية مع محاسبكم.'
      : `انتهى التدقيق: ${critical} حرج، ${warning} تنبيه، النقطة ${score}/100. ركّزوا على ICE ونسب TVA قبل التصدير.`;

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
      supplierInvoicesScanned: suppliers.length,
      accountingEntriesScanned: entries.length,
    },
    findings: findings.sort((a, b) => {
      const rank = { critical: 0, warning: 1, info: 2 };
      return rank[a.severity] - rank[b.severity];
    }),
    summaryFr,
    summaryAr,
  };
}

export { ENGINE as MOROCCO_COMPLIANCE_ENGINE };

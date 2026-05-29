'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, Circle, FileText, Users } from 'lucide-react';
import {
  readCompaniesFromLocalStorage,
  listAtlasCompanies,
} from '@/app/lib/atlas-companies-repository';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import { readClientsFromLocalStorage, listAtlasClients } from '@/app/lib/atlas-clients-repository';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { ATLAS_INCIDENT_HOTFIX_GROWTH } from '@/app/lib/atlas-hotfix';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';

const SESSION_KEY = 'zafirix_show_onboarding';

type Props = {
  lang: 'fr' | 'ar';
};

export function TrialOnboardingChecklist({ lang }: Props) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [companyOk, setCompanyOk] = useState(false);
  const [clientOk, setClientOk] = useState(false);
  const [invoiceOk, setInvoiceOk] = useState(false);

  const t = useMemo(
    () => (fr: string, ar: string) => (lang === 'ar' ? ar : fr),
    [lang],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') queueMicrotask(() => setVisible(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isAtlasSupabaseDataEnabled()) {
        const companyId = await getActiveCompanyDbRowId();
        const [companies, inv, clients] = await Promise.all([
          listAtlasCompanies(),
          listAtlasInvoices(),
          listAtlasClients(companyId ? { companyId } : undefined),
        ]);
        if (cancelled) return;
        setCompanyOk(companies.length > 0);
        setClientOk(clients.length > 0);
        setInvoiceOk(inv.length > 0);
        return;
      }

      const companies = readCompaniesFromLocalStorage();
      const inv = await listAtlasInvoices();
      const clients = readClientsFromLocalStorage();
      if (cancelled) return;
      setCompanyOk(companies.length > 0);
      setClientOk(clients.length > 0);
      setInvoiceOk(inv.length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!companyOk || !clientOk || !invoiceOk) return;
    if (typeof window === 'undefined') return;
    try {
      if (sessionStorage.getItem('atlas_referral_activate_posted') === '1') return;
      sessionStorage.setItem('atlas_referral_activate_posted', '1');
    } catch {
      return;
    }
    if (!isAtlasSupabaseDataEnabled() || ATLAS_INCIDENT_HOTFIX_GROWTH) return;
    void (async () => {
      try {
        const res = await fetch('/api/referral/activate', { method: 'POST', credentials: 'include' });
        if (res.ok) window.dispatchEvent(new Event('zafirix-referral-refresh'));
      } catch {
        // ignore
      }
    })();
  }, [companyOk, clientOk, invoiceOk]);

  if (!visible) return null;

  const dismiss = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setVisible(false);
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-blue-950">{t('Premiers pas', 'الخطوات الأولى')}</p>
          <p className="text-xs text-blue-900/70 mt-0.5">
            {t(
              'Société → client → première facture : débloquez toute la valeur de ZAFIRIX PRO.',
              'شركة → عميل → أول فاتورة: فعّل كل مزايا ZAFIRIX PRO.',
            )}
          </p>
        </div>
        <button type="button" onClick={dismiss} className="text-xs font-semibold text-blue-700 hover:text-blue-900 shrink-0">
          {t('Masquer', 'إخفاء')}
        </button>
      </div>
      <ol className="mt-4 space-y-3">
        <li className="flex items-center gap-3">
          {companyOk ? <CheckCircle2 className="text-emerald-600 shrink-0" size={20} /> : <Circle className="text-blue-300 shrink-0" size={20} />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
              <Building2 size={16} className="text-blue-600 shrink-0" />
              {t('Créer votre première société', 'إنشاء أول شركة')}
            </p>
            {!companyOk && (
              <button
                type="button"
                onClick={() => router.push('/companies')}
                className="mt-1 text-xs font-semibold text-blue-700 hover:underline"
              >
                {t('Ouvrir Mes sociétés', 'افتح الشركات')}
              </button>
            )}
          </div>
        </li>
        <li className="flex items-center gap-3">
          {clientOk ? <CheckCircle2 className="text-emerald-600 shrink-0" size={20} /> : <Circle className="text-blue-300 shrink-0" size={20} />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
              <Users size={16} className="text-emerald-600 shrink-0" />
              {t('Ajouter un premier client', 'إضافة أول عميل')}
            </p>
            {!clientOk && (
              <button
                type="button"
                onClick={() => router.push('/clients')}
                className="mt-1 text-xs font-semibold text-blue-700 hover:underline"
              >
                {t('Ouvrir Clients', 'افتح العملاء')}
              </button>
            )}
          </div>
        </li>
        <li className="flex items-center gap-3">
          {invoiceOk ? <CheckCircle2 className="text-emerald-600 shrink-0" size={20} /> : <Circle className="text-blue-300 shrink-0" size={20} />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
              <FileText size={16} className="text-amber-600 shrink-0" />
              {t('Créer votre première facture', 'إنشاء أول فاتورة')}
            </p>
            {!invoiceOk && (
              <button
                type="button"
                onClick={() => router.push('/factures')}
                className="mt-1 text-xs font-semibold text-blue-700 hover:underline"
              >
                {t('Ouvrir Factures', 'افتح الفواتير')}
              </button>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}

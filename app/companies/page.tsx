'use client';
import { useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronRight, Trash2, CheckCircle, Search } from 'lucide-react';
import type { AtlasCompany } from '@/app/types/atlas-company';
import type { AtlasPaymentTerms, AtlasPaymentTermsPreset } from '@/app/types/atlas-payment-terms';
import { normalizePaymentTerms, paymentTermsLabel } from '@/app/types/atlas-payment-terms';
import {
  canCreateCompany,
  getActivePlan,
  getEffectivePlanLimits,
  getPlanLimits,
  syncCompanyUsageCount,
  refreshAtlasUsageState,
} from '@/app/lib/atlas-usage-limits';
import { getProCompanyAddonExtraSlots } from '@/app/lib/atlas-company-addons';
import { getReferralExtraCompanySlots } from '@/app/lib/atlas-referral-bonus-state';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import {
  atlasCompanyErrorMessage,
  deleteAtlasCompany,
  ensureValidActiveCompany,
  listAtlasCompanies,
  setActiveAtlasCompany,
  upsertAtlasCompany,
} from '@/app/lib/atlas-companies-repository';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { EmptyStateCta } from '@/app/components/ui/EmptyStateCta';
import { trackOnboardingMilestoneOnce } from '@/app/lib/atlas-onboarding-milestones';
import { CompanyLimitProUpsell } from '@/app/components/conversion/CompanyLimitProUpsell';
import { CopyClientPortalLinkButton } from '@/app/components/client-portal/CopyClientPortalLinkButton';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { useManualSubscription } from '@/app/components/subscription/manual-subscription-context';

export default function CompaniesPage() {
  const router = useRouter();
  const { blockPremiumActions } = useManualSubscription();
  const [companies, setCompanies] = useState<AtlasCompany[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [limitNotice, setLimitNotice] = useState('');
  const [termsKind, setTermsKind] = useState<'30' | '60' | '90' | 'custom'>('30');
  const [termsCustomDays, setTermsCustomDays] = useState('45');
  /** Bumps when returning to the tab so Pro add-on limits refresh from localStorage. */
  const [limitRefreshTick, setLimitRefreshTick] = useState(0);
  const [persistError, setPersistError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    raisonSociale: '', formeJuridique: 'SARL', if_fiscal: '', ice: '',
    rc: '', cnss: '', adresse: '', ville: 'Casablanca', telephone: '',
    email: '', activite: '', regimeTVA: 'mensuel',
    balance: '0',
  });

  const reloadCompanies = useCallback(async () => {
    setPersistError('');
    if (isAtlasSupabaseDataEnabled()) {
      setLoading(true);
      try {
        await ensureValidActiveCompany();
        const list = await listAtlasCompanies();
        setCompanies(list);
        syncCompanyUsageCount(list.length);
        await refreshAtlasUsageState();
      } finally {
        setLoading(false);
      }
      return;
    }
    const saved = typeof window !== 'undefined' ? localStorage.getItem(ATLAS_STORAGE_KEYS.companies) : null;
    if (saved) {
      const parsed = JSON.parse(saved) as AtlasCompany[];
      setCompanies(parsed);
      syncCompanyUsageCount(parsed.length);
    } else {
      setCompanies([]);
      syncCompanyUsageCount(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reloadCompanies();
  }, [reloadCompanies]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') setLimitRefreshTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const persistLocalCompanies = (newCompanies: AtlasCompany[]) => {
    setCompanies(newCompanies);
    localStorage.setItem(ATLAS_STORAGE_KEYS.companies, JSON.stringify(newCompanies));
    const active = newCompanies.find((c) => c.actif);
    if (active) localStorage.setItem(ATLAS_STORAGE_KEYS.activeCompany, JSON.stringify(active));
  };

  const canAddCompany = (): boolean => {
    if (isAtlasSupabaseDataEnabled()) {
      const plan = getActivePlan();
      const limits = getEffectivePlanLimits(plan);
      if (limits.companies === null) return true;
      return companies.length < limits.companies;
    }
    return canCreateCompany().allowed;
  };

  const companyLimitMessage = (): string => {
    if (isAtlasSupabaseDataEnabled()) {
      const plan = getActivePlan();
      const limits = getEffectivePlanLimits(plan);
      if (limits.companies === null || companies.length < limits.companies) return '';
      if (plan?.id === 'pro') return '';
      return 'Limite du nombre de sociétés atteinte pour votre forfait.';
    }
    const decision = canCreateCompany();
    return decision.messageFr ?? decision.messageAr ?? 'Limite atteinte.';
  };

  const addCompany = async () => {
    if (!form.raisonSociale) return;
    if (blockPremiumActions) {
      setLimitNotice(
        'Votre abonnement n’est pas encore activé. Finalisez le paiement manuel ou contactez l’équipe ZAFIRIX PRO sur WhatsApp.',
      );
      return;
    }
    const decision = canCreateCompany();
    if (!canAddCompany()) {
      const p = getActivePlan();
      if (p?.id === 'pro') setLimitNotice('');
      else setLimitNotice(companyLimitMessage() || (decision.messageFr ?? decision.messageAr ?? 'Limite atteinte.'));
      return;
    }
    if (decision.level === 'warning') setLimitNotice(decision.messageFr ?? decision.messageAr ?? '');

    const { balance, ...payload } = form;
    void balance;
    const paymentTerms: AtlasPaymentTerms =
      termsKind === 'custom'
        ? { kind: 'custom', days: Number.parseInt(termsCustomDays || '0', 10) || 0 }
        : { kind: 'preset', days: Number.parseInt(termsKind, 10) as AtlasPaymentTermsPreset };
    const normalized = normalizePaymentTerms(paymentTerms);
    const newCompany: AtlasCompany = {
      id: isAtlasSupabaseDataEnabled() ? crypto.randomUUID() : Date.now(),
      ...payload,
      actif: false,
      paymentTerms: normalized,
      balance: Number.parseFloat(form.balance || '0') || 0,
    };
    const wasEmpty = companies.length === 0;

    if (isAtlasSupabaseDataEnabled()) {
      setPersistError('');
      const res = await upsertAtlasCompany(newCompany);
      if (!res.ok) {
        setPersistError(atlasCompanyErrorMessage(res.error));
        return;
      }
      await reloadCompanies();
    } else {
      const merged = [...companies, newCompany];
      persistLocalCompanies(merged);
      syncCompanyUsageCount(merged.length);
    }
    if (wasEmpty) trackOnboardingMilestoneOnce('atlas_ms_first_company', 'onboarding_first_company_created');
    setForm({ raisonSociale: '', formeJuridique: 'SARL', if_fiscal: '', ice: '', rc: '', cnss: '', adresse: '', ville: 'Casablanca', telephone: '', email: '', activite: '', regimeTVA: 'mensuel', balance: '0' });
    setTermsKind('30');
    setTermsCustomDays('45');
    setShowForm(false);
  };

  const selectCompany = async (c: AtlasCompany) => {
    if (isAtlasSupabaseDataEnabled()) {
      if (!c.dbRowId) return;
      setPersistError('');
      const res = await setActiveAtlasCompany(c.dbRowId);
      if (!res.ok) {
        setPersistError(atlasCompanyErrorMessage(res.error));
        return;
      }
      await reloadCompanies();
      router.push('/');
      return;
    }
    const updated = companies.map((row) => ({ ...row, actif: row.id === c.id }));
    persistLocalCompanies(updated);
    router.push('/');
  };

  const deleteCompany = async (c: AtlasCompany) => {
    if (isAtlasSupabaseDataEnabled()) {
      if (!c.dbRowId) return;
      setPersistError('');
      const res = await deleteAtlasCompany(c.dbRowId);
      if (!res.ok) {
        setPersistError(atlasCompanyErrorMessage(res.error));
        return;
      }
      await reloadCompanies();
      return;
    }
    const updated = companies.filter((row) => row.id !== c.id);
    persistLocalCompanies(updated);
    syncCompanyUsageCount(updated.length);
  };

  const filtered = companies.filter(c =>
    c.raisonSociale.toLowerCase().includes(search.toLowerCase()) ||
    c.ville.toLowerCase().includes(search.toLowerCase()) ||
    c.if_fiscal.includes(search)
  );

  const activeCompany = companies.find(c => c.actif);

  const planMeta = useMemo(() => {
    const activePlan = getActivePlan();
    const eff = getEffectivePlanLimits(activePlan);
    const base = getPlanLimits(activePlan);
    const referralExtra = getReferralExtraCompanySlots();
    const addonExtra =
      activePlan?.id === 'pro' ? getProCompanyAddonExtraSlots() + referralExtra : referralExtra;
    const max = eff.companies ?? (activePlan ? 999 : 999);
    const proCapReached = activePlan?.id === 'pro' && eff.companies !== null && companies.length >= eff.companies;
    void limitRefreshTick;
    return { activePlan, eff, base, addonExtra, max, proCapReached, referralExtra };
  }, [companies.length, limitRefreshTick]);

  const formes = ['SARL', 'SA', 'SNC', 'SARL AU', 'Auto-entrepreneur', 'Personne physique'];
  const villes = ['Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tanger', 'Agadir', 'Meknes', 'Oujda', 'Kenitra', 'Autre'];

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar
        variant="module"
        footer={
          <div className="px-4 py-4 border-t border-white/10">
            <div className="bg-amber-400/20 rounded-lg p-3 text-center">
              <p className="text-amber-300 text-xs font-medium">Forfait {planMeta.activePlan?.name ?? '—'}</p>
              <p className="text-white font-bold text-lg">
                {companies.length} / {planMeta.max}
              </p>
              <p className="text-white/40 text-xs">sociétés</p>
              {planMeta.activePlan?.id === 'pro' && planMeta.addonExtra > 0 ? (
                <p className="text-white/50 text-[10px] mt-1">+{planMeta.addonExtra} extension Pro</p>
              ) : null}
              {planMeta.referralExtra > 0 ? (
                <p className="text-white/50 text-[10px] mt-1">+{planMeta.referralExtra} sociétés (parrainage)</p>
              ) : null}
              <div className="w-full bg-white/10 rounded-full h-1.5 mt-2">
                <div
                  className="bg-amber-400 h-1.5 rounded-full"
                  style={{
                    width: `${Math.min((companies.length / Math.max(planMeta.max, 1)) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        }
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Gestion des sociétés</h1>
            <p className="text-xs text-gray-400 mt-0.5">Gérez toutes vos sociétés depuis un seul espace</p>
          </div>
          <button
            onClick={() => {
              if (!canAddCompany()) {
                const p = getActivePlan();
                if (p?.id === 'pro') setLimitNotice('');
                else setLimitNotice(companyLimitMessage() || 'Limite atteinte.');
                return;
              }
              const decision = canCreateCompany();
              if (decision.level === 'warning') setLimitNotice(decision.messageFr ?? decision.messageAr ?? '');
              setShowForm(!showForm);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] transition-colors"
          >
            <Plus size={16} /> Nouvelle société
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {planMeta.proCapReached &&
            planMeta.eff.companies !== null &&
            planMeta.base.companies !== null && (
              <CompanyLimitProUpsell effectiveLimit={planMeta.eff.companies} baseIncluded={planMeta.base.companies} />
            )}
          {limitNotice && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              {limitNotice}
            </div>
          )}
          {persistError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{persistError}</div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total sociétés</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{companies.length}</p>
            </div>
            <div className="rounded-xl p-5 shadow-sm border border-green-200 bg-green-50">
              <p className="text-xs text-gray-400">Societe active</p>
              <p className="text-sm font-bold text-green-600 mt-1 truncate">{activeCompany?.raisonSociale || 'Aucune'}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Places restantes</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{Math.max(0, planMeta.max - companies.length)}</p>
            </div>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une société…" className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-white" />
          </div>

          {showForm && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-200">
              <h2 className="font-semibold text-gray-700 mb-4">Nouvelle société</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">Raison sociale *</label>
                  <input value={form.raisonSociale} onChange={e => setForm({...form, raisonSociale: e.target.value})} placeholder="Ex: MON ENTREPRISE SARL" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Forme juridique</label>
                  <select value={form.formeJuridique} onChange={e => setForm({...form, formeJuridique: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400">
                    {formes.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">IF</label>
                  <input value={form.if_fiscal} onChange={e => setForm({...form, if_fiscal: e.target.value})} placeholder="12345678" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">ICE</label>
                  <input value={form.ice} onChange={e => setForm({...form, ice: e.target.value})} placeholder="001234567000012" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">RC</label>
                  <input value={form.rc} onChange={e => setForm({...form, rc: e.target.value})} placeholder="123456" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">CNSS</label>
                  <input value={form.cnss} onChange={e => setForm({...form, cnss: e.target.value})} placeholder="1234567" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Ville</label>
                  <select value={form.ville} onChange={e => setForm({...form, ville: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400">
                    {villes.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Téléphone</label>
                  <input value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} placeholder="0522123456" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Activité</label>
                  <input value={form.activite} onChange={e => setForm({...form, activite: e.target.value})} placeholder="Commerce..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Régime TVA</label>
                  <select value={form.regimeTVA} onChange={e => setForm({...form, regimeTVA: e.target.value})} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400">
                    <option value="mensuel">Mensuel</option>
                    <option value="trimestriel">Trimestriel</option>
                    <option value="exonere">Exonéré</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">Délai de paiement</label>
                  <div className="flex gap-2">
                    <select
                      value={termsKind}
                      onChange={(e) => setTermsKind(e.target.value as '30' | '60' | '90' | 'custom')}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    >
                      <option value="30">30 jours</option>
                      <option value="60">60 jours</option>
                      <option value="90">90 jours</option>
                      <option value="custom">Personnalisé</option>
                    </select>
                    {termsKind === 'custom' && (
                      <input
                        value={termsCustomDays}
                        onChange={e => setTermsCustomDays(e.target.value)}
                        placeholder="Jours"
                        type="number"
                        min={0}
                        className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Balance (MAD)</label>
                  <input value={form.balance} onChange={e => setForm({...form, balance: e.target.value})} type="number" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                </div>
                <div className="col-span-3 flex gap-3">
                  <button onClick={() => void addCompany()} className="px-6 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660]">Ajouter</button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">Annuler</button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-500 text-center py-10">Chargement des sociétés…</p>
          ) : companies.length === 0 ? (
            <EmptyStateCta
              lang="fr"
              title="Aucune société"
              description="Créez votre première société pour activer la facturation, la TVA et les échéances."
              primaryLabelFr="Ajouter maintenant"
              primaryLabelAr="ابدأ الآن"
              onPrimary={() => setShowForm(true)}
            />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">Aucun résultat pour cette recherche.</p>
          ) : (
          <div className="space-y-3">
            {filtered.map(c => (
              <div key={`${String(c.id)}-${c.dbRowId ?? ''}`} className={`bg-white rounded-xl p-5 shadow-sm border transition-all ${c.actif ? 'border-green-300 bg-green-50' : 'border-gray-100 hover:border-blue-200'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${c.actif ? 'bg-green-500' : 'bg-[#1B2A4A]'}`}>
                    {c.raisonSociale.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-800 truncate">{c.raisonSociale}</p>
                      {c.actif && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                          <CheckCircle size={10} /> Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-gray-400">{c.formeJuridique}</span>
                      {c.if_fiscal && <span className="text-xs text-gray-400">IF: {c.if_fiscal}</span>}
                      {c.ice && <span className="text-xs text-gray-400">ICE: {c.ice}</span>}
                      {c.cnss && <span className="text-xs text-gray-400">CNSS: {c.cnss}</span>}
                      <span className="text-xs text-gray-400">{c.ville}</span>
                      {c.paymentTerms && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          Délai {paymentTermsLabel(c.paymentTerms)}
                        </span>
                      )}
                      {typeof c.balance === 'number' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${c.balance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                          Balance {Math.round(c.balance).toLocaleString()} MAD
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.regimeTVA === 'mensuel' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        TVA {c.regimeTVA}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <CopyClientPortalLinkButton company={c} />
                    {!c.actif && (
                      <button onClick={() => void selectCompany(c)} className="flex items-center gap-1 px-3 py-2 bg-[#1B2A4A] text-white rounded-lg text-xs hover:bg-[#243660]">
                        Sélectionner <ChevronRight size={12} />
                      </button>
                    )}
                    <button onClick={() => void deleteCompany(c)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </main>
    </div>
  );
}
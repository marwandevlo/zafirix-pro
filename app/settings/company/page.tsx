'use client';

import { useEffect, useState } from 'react';
import { Building2, Save, CheckCircle, Receipt, Users, Calculator } from 'lucide-react';
import Link from 'next/link';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { CompanySwitcher } from '@/app/components/shell/CompanySwitcher';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { getActiveAtlasCompany, saveActiveCompanyFields } from '@/app/lib/atlas-active-company';
import { atlasCompanyErrorMessage } from '@/app/lib/atlas-companies-repository';
import type { AtlasCompany } from '@/app/types/atlas-company';

export default function CompanySettingsPage() {
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    raisonSociale: '',
    legalName: '',
    tradeName: '',
    formeJuridique: 'SARL',
    if_fiscal: '',
    ice: '',
    rc: '',
    cnss: '',
    adresse: '',
    ville: '',
    country: 'MA',
    telephone: '',
    email: '',
    website: '',
    logoUrl: '',
    activite: '',
    regimeTVA: 'mensuel',
    exerciceFiscal: '2026',
  });

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const active = await getActiveAtlasCompany();
      if (active) {
        const extra = active as AtlasCompany & Record<string, string | undefined>;
        setForm({
          raisonSociale: active.raisonSociale ?? '',
          legalName: String(extra.legalName ?? active.raisonSociale ?? ''),
          tradeName: String(extra.tradeName ?? active.raisonSociale ?? ''),
          formeJuridique: active.formeJuridique ?? 'SARL',
          if_fiscal: active.if_fiscal ?? '',
          ice: active.ice ?? '',
          rc: active.rc ?? '',
          cnss: active.cnss ?? '',
          adresse: active.adresse ?? '',
          ville: active.ville ?? '',
          country: String(extra.country ?? 'MA'),
          telephone: active.telephone ?? '',
          email: active.email ?? '',
          website: String(extra.website ?? ''),
          logoUrl: String(extra.logoUrl ?? ''),
          activite: active.activite ?? '',
          regimeTVA: active.regimeTVA ?? 'mensuel',
          exerciceFiscal: String(extra.exerciceFiscal ?? '2026'),
        });
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaveError('');
    setSaved(false);
    const res = await saveActiveCompanyFields({
      raisonSociale: form.raisonSociale,
      formeJuridique: form.formeJuridique,
      if_fiscal: form.if_fiscal,
      ice: form.ice,
      rc: form.rc,
      cnss: form.cnss,
      adresse: form.adresse,
      ville: form.ville,
      telephone: form.telephone,
      email: form.email,
      activite: form.activite,
      regimeTVA: form.regimeTVA as AtlasCompany['regimeTVA'],
      legalName: form.legalName,
      tradeName: form.tradeName,
      country: form.country,
      website: form.website,
      logoUrl: form.logoUrl,
      exerciceFiscal: form.exerciceFiscal,
    } as Partial<AtlasCompany>);
    if (!res.ok) {
      setSaveError(atlasCompanyErrorMessage(res.error));
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
    </label>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 size={20} /> Paramètres société
            </h1>
            <p className="text-sm text-gray-500">
              <Link href="/settings" className="text-indigo-600 hover:underline">Paramètres</Link>
              {' / Société'}
            </p>
          </div>
          <CompanySwitcher />
        </header>

        <div className="flex-1 overflow-y-auto p-6 max-w-3xl space-y-6">
          {loading ? (
            <p className="text-gray-500">Chargement…</p>
          ) : !isAtlasSupabaseDataEnabled() ? (
            <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
              Mode local — les paramètres société sont enregistrés dans le navigateur.
            </p>
          ) : null}

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Identité légale</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {field('raisonSociale', 'Raison sociale *')}
              {field('legalName', 'Nom légal')}
              {field('tradeName', 'Nom commercial')}
              {field('formeJuridique', 'Forme juridique')}
              {field('ice', 'ICE')}
              {field('rc', 'RC')}
              {field('if_fiscal', 'IF')}
              {field('cnss', 'CNSS')}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Coordonnées</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {field('adresse', 'Adresse')}
              {field('ville', 'Ville')}
              {field('country', 'Pays')}
              {field('telephone', 'Téléphone')}
              {field('email', 'Email', 'email')}
              {field('website', 'Site web', 'url')}
              {field('logoUrl', 'URL logo', 'url')}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Calculator size={16} /> Comptabilité & fiscal</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {field('activite', 'Activité')}
              {field('regimeTVA', 'Régime TVA')}
              {field('exerciceFiscal', 'Exercice fiscal')}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Receipt size={16} /> TVA</h2>
            <p className="text-sm text-gray-500">Régime TVA et paramètres détaillés dans le module TVA.</p>
            <Link href="/tva" className="text-sm text-indigo-600 hover:underline">Ouvrir module TVA →</Link>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users size={16} /> Paie</h2>
            <p className="text-sm text-gray-500">Paramètres paie et CNSS dans le module RH.</p>
            <Link href="/rh" className="text-sm text-indigo-600 hover:underline">Ouvrir module RH →</Link>
          </section>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <button
            type="button"
            onClick={() => void save()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F1F3D] text-white rounded-lg text-sm font-medium hover:bg-[#1B2A4A]"
          >
            {saved ? <CheckCircle size={16} /> : <Save size={16} />}
            {saved ? 'Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </main>
    </div>
  );
}

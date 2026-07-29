'use client';

import { Building2, FileUp, ImageIcon, X } from 'lucide-react';
import { normalizeIce, normalizeIf } from '@/app/lib/atlas-morocco-compliance';
import type { AtlasCompany } from '@/app/types/atlas-company';
import type { SmartGeneratorBrandingAssets, SmartGeneratorHeader } from '@/app/types/atlas-smart-generator';

export type CompanyMode = 'none' | 'active' | 'manual';

export const EMPTY_HEADER: SmartGeneratorHeader = {
  raisonSociale: '',
  ice: '',
  if_fiscal: '',
  rc: '',
  patent: '',
  cnss: '',
  capitalSocial: '',
  adresse: '',
  ville: '',
  telephone: '',
  fax: '',
  email: '',
};

export function companyToHeader(c: AtlasCompany): SmartGeneratorHeader {
  const json = c as Record<string, unknown>;
  return {
    raisonSociale: c.raisonSociale ?? '',
    ice: c.ice ?? '',
    if_fiscal: c.if_fiscal ?? '',
    rc: c.rc ?? '',
    adresse: c.adresse ?? '',
    ville: c.ville ?? '',
    patent: String(json.taxeProfessionnelle ?? json.patent ?? ''),
    cnss: c.cnss ?? String(json.cnss ?? ''),
    capitalSocial: String(json.capitalSocial ?? json.capital_social ?? ''),
    telephone: c.telephone ?? '',
    fax: String(json.fax ?? ''),
    email: c.email ?? '',
    logoUrl: c.logoUrl,
  };
}

type BrandingState = SmartGeneratorBrandingAssets & {
  logoPreview?: string;
  headerPdfName?: string;
};

type Props = {
  companyMode: CompanyMode;
  onCompanyModeChange: (mode: CompanyMode) => void;
  companies: AtlasCompany[];
  activeCompany: AtlasCompany | null;
  selectedCompanyId: string | null;
  onSelectCompany: (id: string, company: AtlasCompany) => void;
  header: SmartGeneratorHeader;
  onHeaderChange: (header: SmartGeneratorHeader) => void;
  branding: BrandingState;
  onBrandingChange: (branding: BrandingState) => void;
  persistToDb: boolean;
  onPersistToDbChange: (v: boolean) => void;
};

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className={`w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

export function SmartGeneratorLegalHeaderPanel({
  companyMode,
  onCompanyModeChange,
  companies,
  activeCompany,
  selectedCompanyId,
  onSelectCompany,
  header,
  onHeaderChange,
  branding,
  onBrandingChange,
  persistToDb,
  onPersistToDbChange,
}: Props) {
  const patch = (p: Partial<SmartGeneratorHeader>) => onHeaderChange({ ...header, ...p });

  const preview = {
    name: header.raisonSociale?.trim() || '—',
    ice: header.ice ? normalizeIce(header.ice) : '—',
    ifFiscal: header.if_fiscal ? normalizeIf(header.if_fiscal) : '—',
    rc: header.rc?.trim() || '—',
    patent: header.patent?.trim() || '—',
    cnss: header.cnss?.trim() || '—',
    capital: header.capitalSocial?.trim() || '—',
    address: [header.adresse, header.ville].filter(Boolean).join(', ') || '—',
    phone: header.telephone?.trim() || '—',
    fax: header.fax?.trim() || '—',
    email: header.email?.trim() || '—',
  };

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    onBrandingChange({
      ...branding,
      logoPreview: dataUrl,
      logoBase64: dataUrl,
      logoMimeType: file.type || 'image/png',
    });
  };

  const handleHeaderPdfUpload = async (file: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    onBrandingChange({
      ...branding,
      headerPdfName: file.name,
      headerPdfBase64: stripDataUrlPrefix(dataUrl),
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 sticky top-6 space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase">En-tête & société</p>

      <div className="flex flex-col gap-2">
        {([
          ['none', 'Sans société (en-tête libre / vide)'],
          ['active', 'Préremplir depuis société active'],
          ['manual', 'Saisie manuelle complète'],
        ] as const).map(([mode, label]) => (
          <label key={mode} className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="radio"
              name="companyMode"
              checked={companyMode === mode}
              onChange={() => {
                onCompanyModeChange(mode);
                if (mode === 'active' && activeCompany) onHeaderChange(companyToHeader(activeCompany));
                if (mode === 'none') {
                  onHeaderChange({ ...EMPTY_HEADER });
                  onBrandingChange({});
                }
              }}
            />
            {label}
          </label>
        ))}
      </div>

      {companyMode === 'active' && companies.length > 0 && (
        <select
          value={selectedCompanyId ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            const c = companies.find((x) => x.dbRowId === id || String(x.id) === id);
            if (c) onSelectCompany(id, c);
          }}
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2"
        >
          {companies.map((c) => (
            <option key={String(c.dbRowId ?? c.id)} value={String(c.dbRowId ?? c.id)}>
              {c.raisonSociale}
            </option>
          ))}
        </select>
      )}

      {companyMode !== 'none' && (
        <div className="space-y-3">
          <Field
            label="Raison sociale / Nom de la société"
            value={header.raisonSociale ?? ''}
            onChange={(v) => patch({ raisonSociale: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="ICE (Identifiant Commun de l'Entreprise)" value={header.ice ?? ''} onChange={(v) => patch({ ice: v })} mono />
            <Field label="IF (Identifiant Fiscal)" value={header.if_fiscal ?? ''} onChange={(v) => patch({ if_fiscal: v })} mono />
            <Field label="RC (Registre de Commerce)" value={header.rc ?? ''} onChange={(v) => patch({ rc: v })} mono />
            <Field label="Patente" value={header.patent ?? ''} onChange={(v) => patch({ patent: v })} mono />
            <Field label="CNSS (Caisse Nationale de Sécurité Sociale)" value={header.cnss ?? ''} onChange={(v) => patch({ cnss: v })} mono />
            <Field label="Capital social" value={header.capitalSocial ?? ''} onChange={(v) => patch({ capitalSocial: v })} />
          </div>
          <Field label="Adresse" value={header.adresse ?? ''} onChange={(v) => patch({ adresse: v })} />
          <Field label="Ville" value={header.ville ?? ''} onChange={(v) => patch({ ville: v })} />
          <div className="grid grid-cols-1 gap-2">
            <Field label="Téléphone" value={header.telephone ?? ''} onChange={(v) => patch({ telephone: v })} />
            <Field label="Fax" value={header.fax ?? ''} onChange={(v) => patch({ fax: v })} />
            <Field label="Email" value={header.email ?? ''} onChange={(v) => patch({ email: v })} placeholder="contact@societe.ma" />
          </div>
        </div>
      )}

      {companyMode !== 'none' && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">Fichiers de branding</p>

          <div className="rounded-lg border border-dashed border-gray-200 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <ImageIcon size={14} className="text-indigo-500 shrink-0" />
              <span>Télécharger / Uploader le logo</span>
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => void handleLogoUpload(e.target.files?.[0] ?? null)}
              className="w-full text-[10px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700"
            />
            {branding.logoPreview && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoPreview} alt="Logo preview" className="h-12 w-auto max-w-[120px] object-contain rounded border bg-white p-1" />
                <button
                  type="button"
                  onClick={() => onBrandingChange({ ...branding, logoPreview: undefined, logoBase64: undefined, logoMimeType: undefined })}
                  className="text-[10px] text-red-500 hover:underline inline-flex items-center gap-1"
                >
                  <X size={12} /> Retirer
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-dashed border-gray-200 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <FileUp size={14} className="text-indigo-500 shrink-0" />
              <span>Uploader un en-tête PDF pré-dessiné</span>
            </div>
            <p className="text-[10px] text-gray-400">Modèle personnalisé utilisé comme fond de page à l&apos;export PDF.</p>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => void handleHeaderPdfUpload(e.target.files?.[0] ?? null)}
              className="w-full text-[10px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700"
            />
            {branding.headerPdfName && (
              <div className="flex items-center justify-between text-[10px] text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                <span className="truncate">{branding.headerPdfName}</span>
                <button
                  type="button"
                  onClick={() => onBrandingChange({ ...branding, headerPdfName: undefined, headerPdfBase64: undefined })}
                  className="text-red-500 hover:underline inline-flex items-center gap-1 shrink-0 ml-2"
                >
                  <X size={12} /> Retirer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedCompanyId && companyMode !== 'none' && (
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={persistToDb} onChange={(e) => onPersistToDbChange(e.target.checked)} />
          Enregistrer dans atlas_invoices (optionnel)
        </label>
      )}

      {companyMode !== 'none' && (
        <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
          <div className="flex items-start gap-3">
            {branding.logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoPreview} alt="" className="h-10 w-auto max-w-[80px] object-contain shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                <Building2 size={18} className="text-indigo-600" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-sm text-gray-800 truncate">{preview.name}</p>
              {preview.capital !== '—' && (
                <p className="text-[10px] text-gray-500">Capital social : {preview.capital}</p>
              )}
              <p className="text-[10px] text-gray-500">{preview.address}</p>
              {(preview.phone !== '—' || preview.email !== '—') && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {[preview.phone !== '—' ? `Tél. ${preview.phone}` : null, preview.fax !== '—' ? `Fax ${preview.fax}` : null, preview.email !== '—' ? preview.email : null].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="bg-white rounded px-2 py-1 border"><span className="text-gray-400">ICE </span><span className="font-mono">{preview.ice}</span></div>
            <div className="bg-white rounded px-2 py-1 border"><span className="text-gray-400">IF </span><span className="font-mono">{preview.ifFiscal}</span></div>
            <div className="bg-white rounded px-2 py-1 border"><span className="text-gray-400">RC </span><span className="font-mono">{preview.rc}</span></div>
            <div className="bg-white rounded px-2 py-1 border"><span className="text-gray-400">Patente </span><span className="font-mono">{preview.patent}</span></div>
            <div className="bg-white rounded px-2 py-1 border col-span-2"><span className="text-gray-400">CNSS </span><span className="font-mono">{preview.cnss}</span></div>
          </div>
          {branding.headerPdfName && (
            <p className="text-[10px] text-indigo-600">En-tête PDF : {branding.headerPdfName}</p>
          )}
        </div>
      )}

      <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600">Mode indépendant</p>
        <p>• Génération sans société en base possible</p>
        <p>• Articles explicites prioritaires sur l&apos;IA</p>
        <p>• Logo et en-tête PDF intégrés à l&apos;export</p>
      </div>
    </div>
  );
}

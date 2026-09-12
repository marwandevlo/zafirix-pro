'use client';

import { Fragment, useState } from 'react';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';
import type {
  CgncBilan,
  CgncCpc,
  CgncEtatsCompilation,
  CgncImpotSocietes,
  CgncTableauPassage,
} from '@/app/types/atlas-cgnc-etats';

type TabId = 'bilan-n' | 'bilan-s' | 'cpc' | 'passage';

function mad(n: number): string {
  return formatMadAmountLabel(n);
}

function Amount({ value, strong }: { value: number; strong?: boolean }) {
  const cls = value < 0 ? 'text-red-700' : 'text-gray-800';
  return <span className={`tabular-nums ${strong ? 'font-bold' : ''} ${cls}`}>{mad(value)}</span>;
}

function BilanTable({ bilan }: { bilan: CgncBilan }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {([
        ['ACTIF', bilan.actif],
        ['PASSIF', bilan.passif],
      ] as const).map(([title, side]) => (
        <div key={title} className="overflow-hidden rounded-xl border border-gray-200">
          <div className="px-4 py-3 bg-[#1B2A4A] text-white text-sm font-semibold flex justify-between">
            <span>{title} — {bilan.modele === 'normal' ? 'Modèle Normal' : 'Modèle Simplifié'}</span>
            <span>{mad(side.totalNet)}</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 border-b">
                <th className="text-left px-3 py-2 font-medium">Poste</th>
                {bilan.modele === 'normal' && (
                  <>
                    <th className="text-right px-3 py-2 font-medium">Brut</th>
                    <th className="text-right px-3 py-2 font-medium">Amort. / Prov.</th>
                  </>
                )}
                <th className="text-right px-3 py-2 font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {side.masses.map((m) => (
                <Fragment key={`${title}-${m.code}`}>
                  <tr className="bg-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-800" colSpan={bilan.modele === 'normal' ? 4 : 2}>
                      {m.code}. {m.label}
                    </td>
                  </tr>
                  {m.lines.map((l) => (
                    <tr key={`${title}-${m.code}-${l.code}`} className="border-t border-gray-50">
                      <td className="px-3 py-1.5 pl-6 text-gray-700">{l.label}</td>
                      {bilan.modele === 'normal' && (
                        <>
                          <td className="px-3 py-1.5 text-right"><Amount value={l.brut} /></td>
                          <td className="px-3 py-1.5 text-right"><Amount value={l.amortProv} /></td>
                        </>
                      )}
                      <td className="px-3 py-1.5 text-right"><Amount value={l.net} /></td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200 bg-slate-50">
                    <td className="px-3 py-1.5 font-semibold">Total {m.code}</td>
                    {bilan.modele === 'normal' && (
                      <>
                        <td className="px-3 py-1.5 text-right font-semibold"><Amount value={m.totalBrut} strong /></td>
                        <td className="px-3 py-1.5 text-right font-semibold"><Amount value={m.totalAmortProv} strong /></td>
                      </>
                    )}
                    <td className="px-3 py-1.5 text-right font-semibold"><Amount value={m.totalNet} strong /></td>
                  </tr>
                </Fragment>
              ))}
              <tr className="bg-[#1B2A4A] text-white">
                <td className="px-3 py-2 font-bold">TOTAL GÉNÉRAL {title}</td>
                {bilan.modele === 'normal' && (
                  <>
                    <td className="px-3 py-2 text-right font-bold">{mad(side.totalBrut)}</td>
                    <td className="px-3 py-2 text-right font-bold">{mad(side.totalAmortProv)}</td>
                  </>
                )}
                <td className="px-3 py-2 text-right font-bold">{mad(side.totalNet)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
      <div className={`xl:col-span-2 rounded-lg px-4 py-3 text-sm border ${bilan.equilibre ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
        {bilan.equilibre
          ? `Équilibre respecté — Total Actif = Total Passif = ${mad(bilan.actif.totalNet)}`
          : `Déséquilibre — Actif ${mad(bilan.actif.totalNet)} ≠ Passif ${mad(bilan.passif.totalNet)} (écart ${mad(bilan.ecart)})`}
        {bilan.resultatNetInjecte ? ' · Résultat net de l’exercice affecté aux capitaux propres (CPC non soldé).' : ''}
      </div>
    </div>
  );
}

function CpcBlock({ title, lines, total, result }: { title: string; lines: { code: string; label: string; montant: number }[]; total?: number; result?: { label: string; value: number } }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-slate-100 text-xs font-semibold text-slate-700">{title}</div>
      <table className="w-full text-xs">
        <tbody>
          {lines.map((l) => (
            <tr key={l.code} className="border-t border-gray-50">
              <td className="px-4 py-1.5 text-gray-500 w-16">{l.code}</td>
              <td className="px-2 py-1.5 text-gray-700">{l.label}</td>
              <td className="px-4 py-1.5 text-right"><Amount value={l.montant} /></td>
            </tr>
          ))}
          {total != null && (
            <tr className="border-t bg-slate-50">
              <td colSpan={2} className="px-4 py-1.5 font-semibold">Total</td>
              <td className="px-4 py-1.5 text-right"><Amount value={total} strong /></td>
            </tr>
          )}
          {result && (
            <tr className="border-t bg-[#1B2A4A] text-white">
              <td colSpan={2} className="px-4 py-2 font-bold">{result.label}</td>
              <td className="px-4 py-2 text-right font-bold">{mad(result.value)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CpcView({ cpc }: { cpc: CgncCpc }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Compte de Produits et Charges — {cpc.modele === 'normal' ? 'Modèle Normal' : 'Modèle Simplifié'} (CGNC)
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CpcBlock title="I. Produits d'exploitation" lines={cpc.produitsExploitation} total={cpc.totalProduitsExploitation} />
        <CpcBlock title="II. Charges d'exploitation" lines={cpc.chargesExploitation} total={cpc.totalChargesExploitation} result={{ label: 'III. Résultat d\'exploitation', value: cpc.resultatExploitation }} />
        <CpcBlock title="IV. Produits financiers" lines={cpc.produitsFinanciers} total={cpc.totalProduitsFinanciers} />
        <CpcBlock title="V. Charges financières" lines={cpc.chargesFinancieres} total={cpc.totalChargesFinancieres} result={{ label: 'VI. Résultat financier', value: cpc.resultatFinancier }} />
        <CpcBlock title="VIII. Produits non courants" lines={cpc.produitsNonCourants} total={cpc.totalProduitsNonCourants} />
        <CpcBlock title="IX. Charges non courantes" lines={cpc.chargesNonCourantes} total={cpc.totalChargesNonCourantes} result={{ label: 'X. Résultat non courant', value: cpc.resultatNonCourant }} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Résultat courant (VII)', cpc.resultatCourant],
          ['Résultat avant impôts (XI)', cpc.resultatAvantImpots],
          ['Impôts sur les résultats (XII)', cpc.impotsSurLesResultats],
          ['Résultat net (XIII)', cpc.resultatNet],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[11px] text-gray-500">{label}</p>
            <p className="mt-1 text-sm font-bold"><Amount value={Number(value)} strong /></p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PassageView({ passage, impot }: { passage: CgncTableauPassage; impot: CgncImpotSocietes }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-[#1B2A4A] text-white text-sm font-semibold">Tableau de passage — résultat fiscal</div>
        <table className="w-full text-xs">
          <tbody>
            <tr className="border-b">
              <td className="px-4 py-2 text-gray-700">Résultat net comptable</td>
              <td className="px-4 py-2 text-right"><Amount value={passage.resultatNetComptable} strong /></td>
            </tr>
            <tr className="bg-amber-50">
              <td className="px-4 py-2 font-semibold text-amber-900" colSpan={2}>(+) Réintégrations</td>
            </tr>
            {passage.reintegrations.length === 0 && (
              <tr><td className="px-4 py-2 text-gray-400" colSpan={2}>Aucune réintégration automatique</td></tr>
            )}
            {passage.reintegrations.map((r) => (
              <tr key={r.code} className="border-t border-amber-100">
                <td className="px-4 py-1.5 text-gray-700">{r.label} <span className="text-gray-400">({r.cgiRef})</span></td>
                <td className="px-4 py-1.5 text-right"><Amount value={r.montant} /></td>
              </tr>
            ))}
            <tr className="bg-amber-50/60">
              <td className="px-4 py-1.5 font-medium">Total réintégrations</td>
              <td className="px-4 py-1.5 text-right"><Amount value={passage.totalReintegrations} strong /></td>
            </tr>
            <tr className="bg-emerald-50">
              <td className="px-4 py-2 font-semibold text-emerald-900" colSpan={2}>(−) Déductions</td>
            </tr>
            {passage.deductions.length === 0 && (
              <tr><td className="px-4 py-2 text-gray-400" colSpan={2}>Aucune déduction automatique</td></tr>
            )}
            {passage.deductions.map((r) => (
              <tr key={r.code} className="border-t border-emerald-100">
                <td className="px-4 py-1.5 text-gray-700">{r.label} <span className="text-gray-400">({r.cgiRef})</span></td>
                <td className="px-4 py-1.5 text-right"><Amount value={r.montant} /></td>
              </tr>
            ))}
            <tr className="bg-emerald-50/60">
              <td className="px-4 py-1.5 font-medium">Total déductions</td>
              <td className="px-4 py-1.5 text-right"><Amount value={passage.totalDeductions} strong /></td>
            </tr>
            <tr className="bg-[#1B2A4A] text-white">
              <td className="px-4 py-2 font-bold">Résultat fiscal</td>
              <td className="px-4 py-2 text-right font-bold">{mad(passage.resultatFiscal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-[#1B2A4A] text-white text-sm font-semibold">Liquidation IS / Cotisation minimale</div>
        <table className="w-full text-xs">
          <tbody>
            {[
              ['Chiffre d\'affaires HT (base CM)', impot.chiffreAffairesHT],
              ['Résultat fiscal', impot.resultatFiscal],
              [`IS calculé (${impot.tauxApplique})`, impot.isCalcule],
              [impot.cotisationMinimaleTaux, impot.cotisationMinimale],
              ['Plancher CM', impot.cotisationMinimalePlancher],
            ].map(([label, value]) => (
              <tr key={String(label)} className="border-t">
                <td className="px-4 py-2 text-gray-700">{label}</td>
                <td className="px-4 py-2 text-right"><Amount value={Number(value)} /></td>
              </tr>
            ))}
            <tr className="bg-slate-50 border-t">
              <td className="px-4 py-2 text-gray-700">Règle appliquée</td>
              <td className="px-4 py-2 text-right font-medium">
                {impot.cotisationMinimaleAppliquee ? 'Cotisation minimale (CM > IS)' : 'IS calculé (IS ≥ CM)'}
              </td>
            </tr>
            <tr className="bg-[#1B2A4A] text-white">
              <td className="px-4 py-2 font-bold">Impôt dû</td>
              <td className="px-4 py-2 text-right font-bold">{mad(impot.impotDu)}</td>
            </tr>
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-gray-400">Barème {impot.formuleVersion} — à valider par expert-comptable.</p>
      </div>
    </div>
  );
}

export function CgncEtatsPanels({ etats }: { etats: CgncEtatsCompilation }) {
  const [tab, setTab] = useState<TabId>('bilan-n');
  const tabs: { id: TabId; label: string }[] = [
    { id: 'bilan-n', label: 'Bilan — Modèle Normal' },
    { id: 'bilan-s', label: 'Bilan — Modèle Simplifié' },
    { id: 'cpc', label: 'CPC' },
    { id: 'passage', label: 'Tableau de passage & IS' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${tab === t.id ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'bilan-n' && <BilanTable bilan={etats.bilanNormal} />}
      {tab === 'bilan-s' && <BilanTable bilan={etats.bilanSimplifie} />}
      {tab === 'cpc' && <CpcView cpc={etats.cpcNormal} />}
      {tab === 'passage' && <PassageView passage={etats.tableauPassage} impot={etats.impotSocietes} />}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-600 mb-2">Contrôles de cohérence CGNC / CGI</p>
        <ul className="space-y-1">
          {etats.consistency.map((c) => (
            <li key={c.id} className={`text-xs ${c.ok ? 'text-green-700' : 'text-red-700'}`}>
              {c.ok ? '✓' : '✕'} {c.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function etatsFromLiassePayload(payload: Record<string, unknown> | null | undefined): CgncEtatsCompilation | null {
  const raw = payload?.etats_cgnc;
  if (!raw || typeof raw !== 'object') return null;
  return raw as CgncEtatsCompilation;
}

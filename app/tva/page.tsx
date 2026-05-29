'use client';
import { useState } from 'react';
import { Upload, Plus, Trash2, CheckCircle, FileCode, Globe, AlertCircle } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ProductionBlockedSurface } from '@/app/components/safety/ProductionBlockedSurface';
import { isDemoFeatureBlocked } from '@/app/lib/atlas-runtime-guards';

type Facture = {
  id: number;
  ref: string;
  fournisseur: string;
  montantHT: number;
  tva: number;
  type: 'vente' | 'achat';
};

export default function TVAPage() {
  if (isDemoFeatureBlocked('tva_simulation')) {
    return <ProductionBlockedSurface title="Declaration TVA" featureId="tva_simulation" />;
  }
  return <TVAPageContent />;
}

function TVAPageContent() {
  const [activeTab, setActiveTab] = useState<'ventes' | 'achats' | 'declaration'>('ventes');
  const [factures, setFactures] = useState<Facture[]>([]);

  const [newFacture, setNewFacture] = useState({ ref: '', fournisseur: '', montantHT: '', taux: '20' });
  const [uploading, setUploading] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [xmlGenerated, setXmlGenerated] = useState(false);

  const ventes = factures.filter(f => f.type === 'vente');
  const achats = factures.filter(f => f.type === 'achat');
  const tvaCollectee = ventes.reduce((sum, f) => sum + f.tva, 0);
  const tvaDeductible = achats.reduce((sum, f) => sum + f.tva, 0);
  const tvaAPayer = tvaCollectee - tvaDeductible;
  const caVentes = ventes.reduce((sum, f) => sum + f.montantHT, 0);
  const totalAchats = achats.reduce((sum, f) => sum + f.montantHT, 0);

  const addFacture = () => {
    if (!newFacture.ref || !newFacture.fournisseur || !newFacture.montantHT) return;
    const ht = parseFloat(newFacture.montantHT);
    const tva = ht * (parseFloat(newFacture.taux) / 100);
    setFactures([...factures, {
      id: Date.now(),
      ref: newFacture.ref,
      fournisseur: newFacture.fournisseur,
      montantHT: ht,
      tva,
      type: activeTab === 'ventes' ? 'vente' : 'achat',
    }]);
    setNewFacture({ ref: '', fournisseur: '', montantHT: '', taux: '20' });
  };

  const generateXML = () => {
    const now = new Date();
    const periode = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DeclarationTVA xmlns="http://www.tax.gov.ma/tva/v1">
  <Entete>
    <Periode>${periode}</Periode>
    <DateCreation>${now.toISOString().split('T')[0]}</DateCreation>
    <TypeDeclaration>MENSUELLE</TypeDeclaration>
  </Entete>
  <Ventes>
    <ChiffreAffaires>${caVentes}</ChiffreAffaires>
    <TVACollectee>${tvaCollectee}</TVACollectee>
    ${ventes.map(f => `<Facture>
      <Reference>${f.ref}</Reference>
      <Client>${f.fournisseur}</Client>
      <MontantHT>${f.montantHT}</MontantHT>
      <TVA>${f.tva}</TVA>
    </Facture>`).join('\n    ')}
  </Ventes>
  <Achats>
    <TotalAchats>${totalAchats}</TotalAchats>
    <TVADeductible>${tvaDeductible}</TVADeductible>
    ${achats.map(f => `<Facture>
      <Reference>${f.ref}</Reference>
      <Fournisseur>${f.fournisseur}</Fournisseur>
      <MontantHT>${f.montantHT}</MontantHT>
      <TVA>${f.tva}</TVA>
    </Facture>`).join('\n    ')}
  </Achats>
  <Solde>
    <TVACollectee>${tvaCollectee}</TVACollectee>
    <TVADeductible>${tvaDeductible}</TVADeductible>
    <NetAPayer>${tvaAPayer}</NetAPayer>
  </Solde>
</DeclarationTVA>`;

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TVA_${periode}_DGI.xml`;
    a.click();
    URL.revokeObjectURL(url);
    setXmlGenerated(true);
  };

  const simulateUpload = () => {
    setUploading(true);
    setTimeout(() => setUploading(false), 2000);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module">
        {['ventes', 'achats', 'declaration'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab as 'ventes' | 'achats' | 'declaration')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${activeTab === tab ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
          >
            {tab === 'ventes' ? 'Ventes' : tab === 'achats' ? 'Achats' : 'Declaration'}
          </button>
        ))}
      </AppSidebar>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 flex gap-2 items-start">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-700" aria-hidden />
          <p>
            <strong>Fonctionnalité en cours de stabilisation</strong> — Saisie locale uniquement (non reliée à la DGI). Ne pas utiliser pour une déclaration réelle sans validation expert.
          </p>
        </div>
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Declaration TVA</h1>
            <p className="text-xs text-gray-400 mt-0.5">Fonctionnalité en cours de stabilisation · non reliée à la DGI</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generateXML}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
            >
              <FileCode size={16} /> Generer XML DGI
            </button>
            <button
              onClick={() => window.open('https://www.tax.gov.ma', '_blank')}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors"
            >
              <Globe size={16} /> SIMPL-TVA
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">TVA Collectee</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{tvaCollectee.toLocaleString()} MAD</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">TVA Deductible</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{tvaDeductible.toLocaleString()} MAD</p>
            </div>
            <div className={`rounded-xl p-5 shadow-sm border ${tvaAPayer > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-xs text-gray-400">TVA a Payer</p>
              <p className={`text-2xl font-bold mt-1 ${tvaAPayer > 0 ? 'text-red-600' : 'text-green-600'}`}>{tvaAPayer.toLocaleString()} MAD</p>
            </div>
          </div>

          {xmlGenerated && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-500 shrink-0" />
              <div>
                <p className="font-semibold text-green-700">Fichier XML genere avec succes!</p>
                <p className="text-sm text-green-600">Rendez-vous sur SIMPL-TVA pour deposer votre declaration</p>
              </div>
              <button
                onClick={() => window.open('https://www.tax.gov.ma', '_blank')}
                className="ml-auto px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <Globe size={14} /> Ouvrir SIMPL-TVA
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Upload size={16} className="text-blue-500" />
              Import automatique par IA
            </h2>
            <div onClick={simulateUpload} className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-blue-600">Analyse IA en cours...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={24} className="text-gray-400" />
                  <p className="text-sm text-gray-500">Deposez vos factures, releves bancaires ou PDF</p>
                  <p className="text-xs text-gray-400">L&apos;IA extrait automatiquement les donnees TVA</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex border-b border-gray-100">
              {['ventes', 'achats'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as 'ventes' | 'achats')}
                  className={`px-6 py-3 text-sm font-medium transition-all ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  {tab === 'ventes' ? `Ventes (${ventes.length})` : `Achats (${achats.length})`}
                </button>
              ))}
            </div>

            <div className="flex gap-2 p-4 bg-gray-50 border-b border-gray-100">
              <input value={newFacture.ref} onChange={e => setNewFacture({...newFacture, ref: e.target.value})} placeholder="Ref." className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              <input value={newFacture.fournisseur} onChange={e => setNewFacture({...newFacture, fournisseur: e.target.value})} placeholder={activeTab === 'ventes' ? 'Client' : 'Fournisseur'} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              <input value={newFacture.montantHT} onChange={e => setNewFacture({...newFacture, montantHT: e.target.value})} placeholder="Montant HT" type="number" className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              <select value={newFacture.taux} onChange={e => setNewFacture({...newFacture, taux: e.target.value})} className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400">
                <option value="20">20%</option>
                <option value="14">14%</option>
                <option value="10">10%</option>
                <option value="7">7%</option>
              </select>
              <button onClick={addFacture} className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors">
                <Plus size={14} /> Ajouter
              </button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">{activeTab === 'ventes' ? 'Client' : 'Fournisseur'}</th>
                  <th className="px-4 py-3 text-right">Montant HT</th>
                  <th className="px-4 py-3 text-right">TVA</th>
                  <th className="px-4 py-3 text-right">TTC</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(activeTab === 'ventes' ? ventes : achats).map(f => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-700">{f.ref}</td>
                    <td className="px-4 py-3 text-gray-600">{f.fournisseur}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{f.montantHT.toLocaleString()} MAD</td>
                    <td className="px-4 py-3 text-right text-blue-600">{f.tva.toLocaleString()} MAD</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{(f.montantHT + f.tva).toLocaleString()} MAD</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setFactures(factures.filter(x => x.id !== f.id))} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-500" />
              Declaration TVA — Avril 2026
            </h2>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between gap-16"><span className="text-gray-500">TVA collectee:</span><span className="font-medium">{tvaCollectee.toLocaleString()} MAD</span></div>
                <div className="flex justify-between gap-16"><span className="text-gray-500">TVA deductible:</span><span className="font-medium text-green-600">- {tvaDeductible.toLocaleString()} MAD</span></div>
                <div className="flex justify-between gap-16 font-bold text-base pt-1 border-t border-gray-200 mt-1"><span>Net a payer:</span><span className="text-red-600">{tvaAPayer.toLocaleString()} MAD</span></div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={generateXML} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors">
                <FileCode size={14} /> Generer XML DGI
              </button>
              <button onClick={() => window.open('https://www.tax.gov.ma', '_blank')} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors">
                <Globe size={14} /> Deposer sur SIMPL-TVA
              </button>
              <button onClick={() => setDeclared(true)} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-colors ${declared ? 'bg-green-500 text-white' : 'bg-[#1B2A4A] text-white hover:bg-[#243660]'}`}>
                {declared ? <><CheckCircle size={14} /> Declare</> : 'Declarer'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
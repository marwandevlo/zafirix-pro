'use client';
import { useState } from 'react';
import { Plus, FileCode, Globe, CheckCircle } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';

type Employe = {
  id: number;
  nom: string;
  cin: string;
  matriculeCNSS: string;
  salaireBrut: number;
  cnss: number;
  amo: number;
  ir: number;
  salaireNet: number;
};

function calculerSalaire(brut: number): Omit<Employe, 'id' | 'nom' | 'cin' | 'matriculeCNSS'> {
  const cnss = Math.min(brut * 0.0448, 339.12);
  const amo = brut * 0.0226;
  const baseIR = brut - cnss - amo;
  let ir = 0;
  if (baseIR <= 2500) ir = 0;
  else if (baseIR <= 4166) ir = (baseIR - 2500) * 0.1;
  else if (baseIR <= 5000) ir = 166.6 + (baseIR - 4166) * 0.2;
  else if (baseIR <= 6666) ir = 333.4 + (baseIR - 5000) * 0.3;
  else if (baseIR <= 15000) ir = 832.8 + (baseIR - 6666) * 0.34;
  else ir = 3666.6 + (baseIR - 15000) * 0.38;
  return { salaireBrut: brut, cnss, amo, ir, salaireNet: brut - cnss - amo - ir };
}

export default function IRPage() {
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [form, setForm] = useState({ nom: '', cin: '', matriculeCNSS: '', salaireBrut: '' });
  const [showForm, setShowForm] = useState(false);
  const [xmlGenerated, setXmlGenerated] = useState(false);

  const addEmploye = () => {
    if (!form.nom || !form.salaireBrut) return;
    setEmployes([...employes, {
      id: Date.now(),
      nom: form.nom,
      cin: form.cin,
      matriculeCNSS: form.matriculeCNSS,
      ...calculerSalaire(parseFloat(form.salaireBrut))
    }]);
    setForm({ nom: '', cin: '', matriculeCNSS: '', salaireBrut: '' });
    setShowForm(false);
  };

  const totalBrut = employes.reduce((s, e) => s + e.salaireBrut, 0);
  const totalCNSS = employes.reduce((s, e) => s + e.cnss, 0);
  const totalAMO = employes.reduce((s, e) => s + e.amo, 0);
  const totalIR = employes.reduce((s, e) => s + e.ir, 0);
  const totalNet = employes.reduce((s, e) => s + e.salaireNet, 0);
  const cnssPatronal = totalBrut * 0.2126;
  const amoPatronal = totalBrut * 0.0203;

  const generateXMLCNSS = () => {
    const mois = new Date().toISOString().substring(0, 7);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DeclarationCNSS xmlns="http://www.cnss.ma/v1">
  <Entete>
    <Periode>${mois}</Periode>
    <DateCreation>${new Date().toISOString().split('T')[0]}</DateCreation>
    <NombreEmployes>${employes.length}</NombreEmployes>
  </Entete>
  <Employes>
${employes.map(e => `    <Employe>
      <Nom>${e.nom}</Nom>
      <CIN>${e.cin}</CIN>
      <MatriculeCNSS>${e.matriculeCNSS}</MatriculeCNSS>
      <SalaireBrut>${e.salaireBrut}</SalaireBrut>
      <CNSS_Salarial>${e.cnss.toFixed(2)}</CNSS_Salarial>
      <AMO_Salarial>${e.amo.toFixed(2)}</AMO_Salarial>
    </Employe>`).join('\n')}
  </Employes>
  <Totaux>
    <MasseSalariale>${totalBrut}</MasseSalariale>
    <CNSS_Salarial>${totalCNSS.toFixed(2)}</CNSS_Salarial>
    <CNSS_Patronal>${cnssPatronal.toFixed(2)}</CNSS_Patronal>
    <AMO_Salarial>${totalAMO.toFixed(2)}</AMO_Salarial>
    <AMO_Patronal>${amoPatronal.toFixed(2)}</AMO_Patronal>
    <TotalVersement>${(totalCNSS + cnssPatronal + totalAMO + amoPatronal).toFixed(2)}</TotalVersement>
  </Totaux>
</DeclarationCNSS>`;

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CNSS_${mois}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    setXmlGenerated(true);
  };

  const generateXMLIR = () => {
    const mois = new Date().toISOString().substring(0, 7);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Etat9421 xmlns="http://www.tax.gov.ma/ir/v1">
  <Entete>
    <Periode>${mois}</Periode>
    <DateCreation>${new Date().toISOString().split('T')[0]}</DateCreation>
    <NombreEmployes>${employes.length}</NombreEmployes>
  </Entete>
  <Salaries>
${employes.map(e => `    <Salarie>
      <Nom>${e.nom}</Nom>
      <CIN>${e.cin}</CIN>
      <SalaireBrut>${e.salaireBrut}</SalaireBrut>
      <CNSS>${e.cnss.toFixed(2)}</CNSS>
      <AMO>${e.amo.toFixed(2)}</AMO>
      <IR>${e.ir.toFixed(2)}</IR>
      <SalaireNet>${e.salaireNet.toFixed(2)}</SalaireNet>
    </Salarie>`).join('\n')}
  </Salaries>
  <Totaux>
    <TotalBrut>${totalBrut}</TotalBrut>
    <TotalIR>${totalIR.toFixed(2)}</TotalIR>
    <TotalNet>${totalNet.toFixed(2)}</TotalNet>
  </Totaux>
</Etat9421>`;

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IR_9421_${mois}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">IR / Salaires / CNSS</h1>
            <p className="text-xs text-gray-400 mt-0.5">CNSS · AMO · IR mensuel · Export XML DGI & CNSS</p>
          </div>
          <div className="flex gap-2">
            <button onClick={generateXMLCNSS} className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors">
              <FileCode size={14} /> XML CNSS
            </button>
            <button onClick={generateXMLIR} className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors">
              <FileCode size={14} /> XML IR 9421
            </button>
            <button onClick={() => window.open('https://www.cnss.ma', '_blank')} className="flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg text-sm hover:bg-purple-600 transition-colors">
              <Globe size={14} /> CNSS.ma
            </button>
            <button onClick={() => window.open('https://www.tax.gov.ma', '_blank')} className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 transition-colors">
              <Globe size={14} /> SIMPL-IR
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

          {xmlGenerated && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-500 shrink-0" />
              <div>
                <p className="font-semibold text-green-700">Fichier XML CNSS genere!</p>
                <p className="text-sm text-green-600">Deposez sur le portail CNSS.ma</p>
              </div>
              <button onClick={() => window.open('https://www.cnss.ma', '_blank')} className="ml-auto px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 flex items-center gap-2">
                <Globe size={14} /> CNSS.ma
              </button>
            </div>
          )}

          <div className="grid grid-cols-5 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Masse salariale</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{totalBrut.toLocaleString()} MAD</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">CNSS salarial</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{totalCNSS.toFixed(0)} MAD</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">CNSS patronal</p>
              <p className="text-xl font-bold text-purple-600 mt-1">{cnssPatronal.toFixed(0)} MAD</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">IR a verser</p>
              <p className="text-xl font-bold text-red-600 mt-1">{totalIR.toFixed(0)} MAD</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total net</p>
              <p className="text-xl font-bold text-green-600 mt-1">{totalNet.toFixed(0)} MAD</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Total a verser CNSS ce mois</h2>
            </div>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-gray-400">CNSS salarial (4.48%)</p>
                <p className="font-bold text-blue-700">{totalCNSS.toFixed(2)} MAD</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-gray-400">CNSS patronal (21.26%)</p>
                <p className="font-bold text-purple-700">{cnssPatronal.toFixed(2)} MAD</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-gray-400">AMO total</p>
                <p className="font-bold text-green-700">{(totalAMO + amoPatronal).toFixed(2)} MAD</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-xs text-gray-400">TOTAL a verser</p>
                <p className="font-bold text-red-700 text-lg">{(totalCNSS + cnssPatronal + totalAMO + amoPatronal).toFixed(2)} MAD</p>
              </div>
            </div>
          </div>

          {showForm && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-200">
              <h2 className="font-semibold text-gray-700 mb-4">Nouvel employe</h2>
              <div className="grid grid-cols-2 gap-4">
                <input value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} placeholder="Nom complet" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.cin} onChange={e => setForm({...form, cin: e.target.value})} placeholder="CIN" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.matriculeCNSS} onChange={e => setForm({...form, matriculeCNSS: e.target.value})} placeholder="Matricule CNSS" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <input value={form.salaireBrut} onChange={e => setForm({...form, salaireBrut: e.target.value})} placeholder="Salaire brut (MAD)" type="number" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <button onClick={addEmploye} className="px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660]">Ajouter</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">Annuler</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Liste des employes</h2>
              <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] transition-colors">
                <Plus size={16} /> Ajouter employe
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3">Employe</th>
                  <th className="px-4 py-3">CIN</th>
                  <th className="px-4 py-3 text-right">Brut</th>
                  <th className="px-4 py-3 text-right">CNSS</th>
                  <th className="px-4 py-3 text-right">AMO</th>
                  <th className="px-4 py-3 text-right">IR</th>
                  <th className="px-4 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {employes.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-700">{e.nom}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{e.cin}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{e.salaireBrut.toLocaleString()} MAD</td>
                    <td className="px-4 py-3 text-right text-blue-600">{e.cnss.toFixed(2)} MAD</td>
                    <td className="px-4 py-3 text-right text-purple-600">{e.amo.toFixed(2)} MAD</td>
                    <td className="px-4 py-3 text-right text-red-600">{e.ir.toFixed(2)} MAD</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">{e.salaireNet.toFixed(2)} MAD</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold text-sm">
                  <td colSpan={2} className="px-4 py-3 text-gray-600">TOTAL</td>
                  <td className="px-4 py-3 text-right">{totalBrut.toLocaleString()} MAD</td>
                  <td className="px-4 py-3 text-right text-blue-700">{totalCNSS.toFixed(2)} MAD</td>
                  <td className="px-4 py-3 text-right text-purple-700">{totalAMO.toFixed(2)} MAD</td>
                  <td className="px-4 py-3 text-right text-red-700">{totalIR.toFixed(2)} MAD</td>
                  <td className="px-4 py-3 text-right text-green-700">{totalNet.toFixed(2)} MAD</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
'use client';
import { useState } from 'react';
import { Download, TrendingUp, Calculator, Users, Receipt } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ProductionBlockedSurface } from '@/app/components/safety/ProductionBlockedSurface';
import { isDemoFeatureBlocked } from '@/app/lib/atlas-runtime-guards';

export default function RapportsPage() {
  if (isDemoFeatureBlocked('reports_static_pdf')) {
    return <ProductionBlockedSurface title="Rapports & Declarations PDF" featureId="reports_static_pdf" />;
  }
  return <RapportsPageContent />;
}

function RapportsPageContent() {
  const [generating, setGenerating] = useState<string | null>(null);

  const generatePDF = async (type: string) => {
    setGenerating(type);
    
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    type DocWithAutoTable = InstanceType<typeof jsPDF> & { lastAutoTable?: { finalY: number } };

    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-MA');
    
    // Header
    doc.setFillColor(15, 31, 61);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('ZAFIRIX PRO', 15, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Plateforme SaaS - Maroc', 15, 22);
    doc.text(`Date: ${dateStr}`, 15, 29);

    if (type === 'tva') {
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('DECLARATION TVA - Avril 2026', 15, 50);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Periode: Avril 2026', 15, 60);
      doc.text('Regime: Mensuel', 15, 67);

      autoTable(doc, {
        startY: 75,
        head: [['Description', 'Montant (MAD)']],
        body: [
          ['Chiffre d\'affaires HT', '15 000.00'],
          ['TVA collectee (20%)', '3 000.00'],
          ['Achats HT deductibles', '3 000.00'],
          ['TVA deductible', '600.00'],
          ['TVA nette a payer', '2 400.00'],
        ],
        headStyles: { fillColor: [15, 31, 61] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      const finalY = ((doc as DocWithAutoTable).lastAutoTable?.finalY ?? 75) + 10;
      doc.setFillColor(254, 242, 242);
      doc.rect(15, finalY, 180, 20, 'F');
      doc.setTextColor(185, 28, 28);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('TVA A PAYER: 2 400.00 MAD', 20, finalY + 13);
      
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Echeance: 20 Mai 2026 - Portail: www.tax.gov.ma', 15, finalY + 35);
    }

    if (type === 'is') {
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('DECLARATION IS - Exercice 2025', 15, 50);

      autoTable(doc, {
        startY: 65,
        head: [['Element', 'Montant (MAD)']],
        body: [
          ['Chiffre d\'affaires', '1 200 000.00'],
          ['Charges d\'exploitation', '450 000.00'],
          ['Salaires bruts', '300 000.00'],
          ['Amortissements', '50 000.00'],
          ['Resultat fiscal', '400 000.00'],
          ['Taux IS applique', '20%'],
          ['IS calcule', '80 000.00'],
          ['Cotisation minimale (0.5%)', '6 000.00'],
          ['IS A PAYER', '80 000.00'],
          ['Acompte trimestriel', '20 000.00'],
        ],
        headStyles: { fillColor: [88, 28, 135] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
    }

    if (type === 'cnss') {
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('BORDEREAU CNSS - Avril 2026', 15, 50);

      autoTable(doc, {
        startY: 65,
        head: [['Employe', 'CIN', 'Salaire Brut', 'CNSS Sal.', 'AMO Sal.', 'IR']],
        body: [
          ['Ahmed Benali', 'BK123456', '8 000.00', '339.12', '180.80', '1 109.59'],
          ['Fatima Zahra', 'BE789012', '12 000.00', '339.12', '271.20', '2 438.85'],
          ['Youssef Kadiri', 'BJ345678', '6 000.00', '268.80', '135.60', '513.15'],
          ['TOTAL', '', '26 000.00', '947.04', '587.60', '4 061.59'],
        ],
        headStyles: { fillColor: [21, 128, 61] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      const finalY = ((doc as DocWithAutoTable).lastAutoTable?.finalY ?? 65) + 10;
      autoTable(doc, {
        startY: finalY,
        head: [['Cotisation', 'Taux', 'Montant (MAD)']],
        body: [
          ['CNSS salarial', '4.48%', '947.04'],
          ['CNSS patronal', '21.26%', '5 527.60'],
          ['AMO salarial', '2.26%', '587.60'],
          ['AMO patronal', '2.03%', '527.80'],
          ['TOTAL A VERSER CNSS', '', '7 590.04'],
        ],
        headStyles: { fillColor: [21, 128, 61] },
      });
    }

    if (type === 'bilan') {
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('BILAN SIMPLIFIE - Exercice 2025', 15, 50);

      doc.setFontSize(12);
      doc.text('ACTIF', 15, 65);
      autoTable(doc, {
        startY: 70,
        head: [['Poste', 'Montant (MAD)']],
        body: [
          ['Immobilisations nettes', '250 000.00'],
          ['Stocks', '80 000.00'],
          ['Creances clients', '120 000.00'],
          ['Tresorerie', '50 000.00'],
          ['TOTAL ACTIF', '500 000.00'],
        ],
        headStyles: { fillColor: [37, 99, 235] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        tableWidth: 85,
      });

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PASSIF', 115, 65);
      autoTable(doc, {
        startY: 70,
        margin: { left: 110 },
        head: [['Poste', 'Montant (MAD)']],
        body: [
          ['Capital social', '200 000.00'],
          ['Reserves', '100 000.00'],
          ['Resultat net', '80 000.00'],
          ['Dettes fournisseurs', '120 000.00'],
          ['TOTAL PASSIF', '500 000.00'],
        ],
        headStyles: { fillColor: [37, 99, 235] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        tableWidth: 85,
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(15, 31, 61);
      doc.rect(0, 285, 210, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.text('ZAFIRIX PRO - Logiciel de comptabilite Maroc - www.zafirix.group', 15, 292);
      doc.text(`Page ${i}/${pageCount}`, 185, 292);
    }

    doc.save(`${type}_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}.pdf`);
    setGenerating(null);
  };

  const rapports = [
    { id: 'tva', label: 'Declaration TVA', desc: 'TVA collectee, deductible, net a payer', icon: Receipt, color: 'bg-blue-500', period: 'Avril 2026' },
    { id: 'is', label: 'Declaration IS', desc: 'Resultat fiscal, IS calcule, acomptes', icon: Calculator, color: 'bg-purple-500', period: 'Exercice 2025' },
    { id: 'cnss', label: 'Bordereau CNSS', desc: 'Salaries, cotisations, total a verser', icon: Users, color: 'bg-green-500', period: 'Avril 2026' },
    { id: 'bilan', label: 'Bilan simplifie', desc: 'Actif, passif, situation nette', icon: TrendingUp, color: 'bg-amber-500', period: 'Exercice 2025' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <h1 className="text-xl font-bold text-gray-800">Rapports & Declarations PDF</h1>
          <p className="text-xs text-gray-400 mt-0.5">Generez vos documents officiels en un clic</p>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-2 gap-6">
            {rapports.map(r => (
              <div key={r.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 ${r.color} rounded-xl flex items-center justify-center shrink-0`}>
                    <r.icon size={24} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-bold text-gray-800">{r.label}</h2>
                    <p className="text-sm text-gray-400 mt-1">{r.desc}</p>
                    <p className="text-xs text-blue-500 mt-1 font-medium">Periode: {r.period}</p>
                  </div>
                </div>
                <button
                  onClick={() => generatePDF(r.id)}
                  disabled={generating === r.id}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#243660] transition-colors disabled:opacity-50"
                >
                  {generating === r.id ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Generation en cours...
                    </>
                  ) : (
                    <>
                      <Download size={16} /> Telecharger PDF
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
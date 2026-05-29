'use client';
import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Download, CheckCircle, BarChart2 } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ProductionBlockedSurface } from '@/app/components/safety/ProductionBlockedSurface';
import { isDemoFeatureBlocked } from '@/app/lib/atlas-runtime-guards';

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');


type Message = { role: 'user' | 'assistant'; content: string; };

const questions = [
  { key: 'nom_projet', q: "Quel est le nom de votre projet?" },
  { key: 'secteur', q: "Dans quel secteur d'activite?\n(Commerce, Services, Restauration, BTP, Industrie, Agriculture, Transport, Sante, IT...)" },
  { key: 'forme_juridique', q: "Forme juridique souhaitee?\n1. Auto-entrepreneur\n2. SARL AU (associe unique)\n3. SARL (plusieurs associes)\n4. SA\n5. Recommandez-moi la meilleure option" },
  { key: 'ville', q: "Dans quelle ville au Maroc?" },
  { key: 'description', q: "Decrivez votre projet et ce qui le differencie de la concurrence (2-3 phrases)." },
  { key: 'financement', q: "Type de financement recherche?\n1. Pret bancaire classique\n2. Programme Intelaka\n3. Fonds Hassan II\n4. Investisseur prive\n5. Autofinancement\n6. Combinaison" },
  { key: 'raison_sociale', q: "Raison sociale de la societe?" },
  { key: 'adresse_societe', q: "Adresse complete du siege social?" },
  { key: 'capital', q: "Capital social en MAD?" },
  { key: 'rc', q: "Numero RC (Registre de Commerce)? (ou 'en cours' si pas encore)" },
  { key: 'if_fiscal', q: "Numero IF (Identifiant Fiscal)? (ou 'en cours')" },
  { key: 'ice', q: "Numero ICE? (ou 'en cours')" },
  { key: 'cnss', q: "Numero CNSS? (ou 'en cours')" },
  { key: 'tp', q: "Numero TP (Taxe Professionnelle)? (ou 'en cours')" },
  { key: 'nom_gerant', q: "Nom complet du gerant/porteur de projet?" },
  { key: 'nationalite', q: "Nationalite du gerant?" },
  { key: 'adresse_gerant', q: "Adresse personnelle complete du gerant?" },
  { key: 'cin', q: "Numero de la Carte Nationale d'Identite (CIN)?" },
  { key: 'date_naissance', q: "Date de naissance du gerant? (JJ/MM/AAAA)" },
  { key: 'lieu_naissance', q: "Lieu de naissance du gerant?" },
  { key: 'experience', q: "Decrivez votre experience dans ce domaine (annees, postes, formations...)?" },
  { key: 'loyer', q: "Loyer mensuel prevu en MAD? (0 si local propre)" },
  { key: 'employes', q: "Nombre d'employes au demarrage?" },
  { key: 'ca_prevu', q: "Chiffre d'affaires mensuel vise en MAD?" },
  { key: 'charges', q: "Autres charges mensuelles en MAD (fournitures, transport, communication...)" },
];

export default function EtudeProjetPage() {
  if (isDemoFeatureBlocked('etude_projet_wizard')) {
    return <ProductionBlockedSurface title="Etude de projet" featureId="etude_projet_wizard" />;
  }
  return <EtudeProjetPageContent />;
}

function EtudeProjetPageContent() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Bonjour! 👋 Je suis votre expert en création d'entreprise au Maroc.\n\nJe vais créer une étude de faisabilité PROFESSIONNELLE prête à soumettre à une banque, un investisseur ou un programme de soutien (Intelaka, Hassan II...).\n\nRépondez à mes questions et votre dossier sera prêt en quelques minutes!\n\n" + questions[0].q }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, string>>({});
  const [etudeReady, setEtudeReady] = useState(false);
  const [etude, setEtude] = useState('');
  const [companyData, setCompanyData] = useState<Record<string, string>>({});
  const [financials, setFinancials] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('atlas_company');
    if (saved) setCompanyData(JSON.parse(saved));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input };
    const currentKey = questions[step]?.key;
    const newData = { ...data, [currentKey]: input };
    setData(newData);
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const nextStep = step + 1;
    setStep(nextStep);
    if (nextStep < questions.length) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'assistant', content: questions[nextStep].q }]);
      }, 400);
    } else {
      setLoading(true);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "✅ Parfait! J'ai toutes les informations.\n\n🔄 Génération de votre étude complète...\nCela peut prendre 15-30 secondes ⏳"
      }]);
      await generateEtude(newData);
      setLoading(false);
    }
  };

  const generateEtude = async (projectData: Record<string, string>) => {
    const capital = parseFloat(projectData.capital) || 0;
    const loyer = parseFloat(projectData.loyer) || 0;
    const employes = parseFloat(projectData.employes) || 0;
    const ca = parseFloat(projectData.ca_prevu) || 0;
    const charges = parseFloat(projectData.charges) || 0;
    const salaireMoyen = 4500;
    const totalSalaires = employes * salaireMoyen;
    const cnssPatronal = totalSalaires * 0.2126;
    const amoPatronal = totalSalaires * 0.0203;
    const totalCharges = loyer + totalSalaires + cnssPatronal + amoPatronal + charges;
    const resultatMensuel = ca - totalCharges;
    const resultatAnnuel = resultatMensuel * 12;
    const tva = ca * 0.20;
    const is = resultatAnnuel > 0 ? (resultatAnnuel <= 300000 ? resultatAnnuel * 0.10 : resultatAnnuel <= 1000000 ? resultatAnnuel * 0.20 : resultatAnnuel * 0.26) : 0;
    const payback = capital > 0 && resultatMensuel > 0 ? Math.ceil(capital / resultatMensuel) : 0;
    const rentabilite = ca > 0 ? ((resultatMensuel / ca) * 100).toFixed(1) : '0';
    const score = resultatMensuel > ca * 0.25 ? '🟢 EXCELLENT' : resultatMensuel > ca * 0.10 ? '🟡 BON' : resultatMensuel > 0 ? '🟠 ACCEPTABLE' : '🔴 RISQUÉ';

    setFinancials({ capital, loyer, employes, ca, charges, totalSalaires, cnssPatronal, amoPatronal, totalCharges, resultatMensuel, resultatAnnuel, tva, is, payback, rentabilite: parseFloat(rentabilite) });

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'consultant',
          message: `Tu es un expert-comptable et conseiller en création d'entreprise au Maroc. Génère une étude de faisabilité PROFESSIONNELLE et COMPLÈTE.

PORTEUR DU PROJET:
- Nom complet: ${projectData.nom_gerant}
- Nationalite: ${projectData.nationalite || 'Marocaine'}
- Adresse: ${projectData.adresse_gerant || ''}
- CIN: ${projectData.cin}
- Date de naissance: ${projectData.date_naissance || ''}
- Lieu de naissance: ${projectData.lieu_naissance || ''}
- Experience: ${projectData.experience}

ENTREPRISE:
- Raison sociale: ${data.raison_sociale || companyData.raisonSociale || 'A creer'}
- IF: ${companyData.if_fiscal || 'A obtenir'}
- ICE: ${companyData.ice || 'A obtenir'}
- RC: ${companyData.rc || 'A obtenir'}
- CNSS: ${companyData.cnss || 'A obtenir'}
- Adresse: ${companyData.adresse || ''} ${companyData.ville || ''}

PROJET:
- Nom: ${projectData.nom_projet}
- Secteur: ${projectData.secteur}
- Forme juridique: ${projectData.forme_juridique}
- Ville: ${projectData.ville}
- Description: ${projectData.description}
- Financement: ${projectData.financement}

ANALYSE FINANCIERE:
- Capital: ${capital} MAD
- CA mensuel: ${ca} MAD | Annuel: ${fmt(ca*12)} MAD
- Loyer: ${loyer} MAD/mois
- Salaires (${employes} emp x 4500): ${totalSalaires} MAD
- CNSS patronal: ${cnssPatronal.toFixed(0)} MAD | AMO: ${amoPatronal.toFixed(0)} MAD
- Autres charges: ${charges} MAD
- TOTAL CHARGES: ${totalCharges} MAD/mois
- RESULTAT NET: ${resultatMensuel} MAD/mois | ${resultatAnnuel} MAD/an
- TVA mensuelle: ${tva} MAD
- IS annuel: ${is} MAD
- Payback: ${payback} mois
- Rentabilite: ${rentabilite}%
- Score: ${score}

Genere l'etude avec ces 12 sections detaillees en francais professionnel. Sois tres precis avec des donnees reelles du marche marocain. Le document doit convaincre une banque.

1. RESUME EXECUTIF
2. PRESENTATION DU PORTEUR DE PROJET (details biographiques, competences, motivations)
3. DESCRIPTION DU PROJET (concept, produits/services, valeur ajoutee, avantage concurrentiel)
4. ANALYSE DU MARCHE MAROCAIN - ${projectData.secteur} (taille, tendances, concurrence a ${projectData.ville})
5. FORME JURIDIQUE ET CADRE LEGAL (analyse ${projectData.forme_juridique}, etapes, couts)
6. PLAN FINANCIER PREVISIONNEL 3 ANS (tableaux detailles)
7. ANALYSE FISCALE ET SOCIALE COMPLETE (TVA, IS, CNSS, declarations)
8. BESOINS EN FINANCEMENT (${capital} MAD, options ${projectData.financement})
9. ANALYSE SWOT
10. INDICATEURS CLES DE PERFORMANCE (seuil rentabilite, payback, ROI)
11. PLAN D'ACTION - CALENDRIER
12. CONCLUSION ET RECOMMANDATION D'EXPERT`
        }),
      });
      const responseData = await response.json();
      setEtude(responseData.response);
      setEtudeReady(true);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `🎉 Votre étude de faisabilité est prête!\n\n${score}\n\n📊 Indicateurs clés:\n• CA visé: ${ca} MAD/mois\n• Charges: ${totalCharges} MAD/mois\n• Résultat net: ${resultatMensuel} MAD/mois\n• Rentabilité: ${rentabilite}%\n• Payback: ${payback} mois\n\n✅ Document prêt pour banque / Intelaka / investisseurs\n\n📄 Téléchargez votre PDF professionnel →`
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erreur. Réessayez.' }]);
    }
  };

  const downloadPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    type DocWithAutoTable = InstanceType<typeof jsPDF> & { lastAutoTable?: { finalY: number } };
    const doc = new jsPDF();
    const W = 210; const H = 297;

    const navy: [number,number,number] = [15, 31, 61];
    const gold: [number,number,number] = [251, 191, 36];
    const white: [number,number,number] = [255, 255, 255];
    const green: [number,number,number] = [21, 128, 61];
    const red: [number,number,number] = [185, 28, 28];
    const gray: [number,number,number] = [100, 100, 100];
    const lightgray: [number,number,number] = [245, 247, 250];
    const blue: [number,number,number] = [37, 99, 235];

    const addHeader = (title: string, subtitle = '') => {
      doc.setFillColor(...navy); doc.rect(0, 0, W, 22, 'F');
      doc.setFillColor(...gold); doc.rect(0, 0, 6, H, 'F');
      doc.setTextColor(...white); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text(title, 14, 14);
      if (subtitle) { doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text(subtitle, 14, 20); }
      doc.setFillColor(...gold); doc.rect(0, 22, W, 1, 'F');
    };

    const addFooter = (pageNum: number, total: number) => {
      doc.setFillColor(...navy); doc.rect(0, 287, W, 10, 'F');
      doc.setTextColor(...white); doc.setFontSize(7);
      doc.text(`${data.nom_projet || 'Etude de Faisabilite'} · Confidentiel`, 14, 293);
      doc.text(`${pageNum} / ${total}`, W - 14, 293, { align: 'right' });
    };

    const drawBarChart = (x: number, y: number, w: number, h: number, values: number[], labels: string[], colors: [number,number,number][], title: string) => {
      doc.setTextColor(...navy); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(title, x, y - 2);
      const max = Math.max(...values, 1);
      const barW = (w - (values.length - 1) * 4) / values.length;
      values.forEach((val, i) => {
        const barH = (val / max) * h;
        const bx = x + i * (barW + 4);
        const by = y + h - barH;
        doc.setFillColor(...colors[i]); doc.rect(bx, by, barW, barH, 'F');
        doc.setFontSize(6); doc.setFont('helvetica', 'normal');
        doc.setTextColor(...gray);
        doc.text(labels[i], bx + barW/2, y + h + 5, { align: 'center' });
        if (val > 0) doc.text(fmt(val), bx + barW/2, by - 1, { align: 'center' });
      });
      doc.setDrawColor(...navy); doc.setLineWidth(0.3);
      doc.line(x, y, x, y + h); doc.line(x, y + h, x + w, y + h);
    };

    const TOTAL_PAGES = 7;

    // ══ PAGE 1 — COUVERTURE ══
    doc.setFillColor(...navy); doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(...gold); doc.rect(0, 0, 8, H, 'F');
    doc.setFillColor(25, 45, 80); doc.rect(8, 0, W-8, H, 'F');

    doc.setFillColor(...gold); doc.roundedRect(20, 20, 55, 14, 3, 3, 'F');
    doc.setTextColor(...navy); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    

    doc.setFillColor(...gold); doc.rect(20, 44, 170, 1.5, 'F');

    doc.setTextColor(...white); doc.setFontSize(38); doc.setFont('helvetica', 'bold');
    doc.text('ETUDE DE', 20, 75); doc.text('FAISABILITE', 20, 97);
    doc.setFillColor(...gold); doc.rect(20, 103, 110, 2, 'F');

    doc.setFontSize(20); doc.setTextColor(...gold);
    doc.text(data.nom_projet || 'Mon Projet', 20, 118);

    const infos = [
      { label: 'SECTEUR', value: data.secteur || '' },
      { label: 'FORME JURIDIQUE', value: data.forme_juridique || '' },
      { label: 'VILLE', value: data.ville || '' },
      { label: 'CAPITAL', value: `${(parseFloat(data.capital||'0'))} MAD` },
    ];
    infos.forEach((info, i) => {
      const ix = 20 + (i % 2) * 90; const iy = 132 + Math.floor(i / 2) * 22;
      doc.setFillColor(35, 55, 95); doc.roundedRect(ix, iy, 82, 18, 2, 2, 'F');
      doc.setTextColor(...gold); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.text(info.label, ix + 4, iy + 7);
      doc.setTextColor(...white); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(info.value, ix + 4, iy + 14);
    });

    const scoreColor: [number,number,number] = financials.resultatMensuel > financials.ca * 0.25 ? [21,128,61] : financials.resultatMensuel > 0 ? [217,119,6] : [185,28,28];
    const scoreText = financials.resultatMensuel > financials.ca * 0.25 ? 'EXCELLENT' : financials.resultatMensuel > 0 ? 'BON' : 'RISQUE';
    doc.setFillColor(...scoreColor); doc.roundedRect(20, 182, 65, 20, 3, 3, 'F');
    doc.setTextColor(...white); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('SCORE VIABILITE', 52, 191, { align: 'center' });
    doc.setFontSize(12); doc.text(scoreText, 52, 199, { align: 'center' });

    doc.setFillColor(30, 50, 90); doc.roundedRect(20, 212, 170, 48, 3, 3, 'F');
    doc.setTextColor(...gold); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('PORTEUR DE PROJET', 25, 222);
    doc.setTextColor(...white); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(data.nom_gerant || '', 25, 232);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`CIN: ${data.cin || ''}`, 25, 240);
    doc.text(`Experience: ${(data.experience || '').substring(0, 60)}`, 25, 248);
    if (companyData.raisonSociale) {
      doc.setTextColor(...gold); doc.setFontSize(8);
      doc.text(`Societe: ${companyData.raisonSociale}`, 25, 256);
    }

    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text(`Preparee le ${new Date().toLocaleDateString('fr-MA')} par `, 20, 275);
    doc.text('Document confidentiel — Usage bancaire, investisseurs, Intelaka, Hassan II', 20, 281);

    // ══ PAGE 2 — PORTEUR DE PROJET ══
    doc.addPage(); addHeader('PORTEUR DE PROJET', 'Presentation detaillee du gerant et porteur de projet');
    let y = 32;

    doc.setFillColor(230, 235, 245); doc.roundedRect(152, y, 42, 52, 3, 3, 'F');
    doc.setDrawColor(...navy); doc.setLineWidth(0.5); doc.roundedRect(152, y, 42, 52, 3, 3, 'S');
    doc.setTextColor(...navy); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('PHOTO', 173, y+24, { align: 'center' });
    doc.text('IDENTITE', 173, y+30, { align: 'center' });

    doc.setFillColor(...lightgray); doc.roundedRect(14, y, 132, 52, 3, 3, 'F');
    doc.setTextColor(...navy); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(data.nom_gerant || '', 20, y+13);
    doc.setFillColor(...gold); doc.rect(20, y+15, 70, 1, 'F');
    const idFields = [['CIN', data.cin||''], ['Ville', data.ville||''], ['Financement', data.financement||'']];
    idFields.forEach((f, i) => {
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gray);
      doc.text(f[0], 20, y+23+i*10);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...navy); doc.setFontSize(9);
      doc.text(f[1].substring(0,40), 45, y+23+i*10);
    });
    y += 60;

    doc.setFillColor(...navy); doc.roundedRect(14, y, W-28, 8, 2, 2, 'F');
    doc.setTextColor(...white); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('EXPERIENCE ET COMPETENCES', 20, y+5.5);
    y += 10;
    doc.setFillColor(...lightgray); doc.roundedRect(14, y, W-28, 38, 2, 2, 'F');
    doc.setTextColor(...navy); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    const expLines = doc.splitTextToSize(data.experience || '', W-38);
    expLines.slice(0, 6).forEach((line: string, i: number) => { doc.text('> ' + line, 20, y+8+i*5.5); });
    y += 46;

    doc.setFillColor(...navy); doc.roundedRect(14, y, W-28, 8, 2, 2, 'F');
    doc.setTextColor(...white); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('DESCRIPTION DU PROJET ET AVANTAGE CONCURRENTIEL', 20, y+5.5);
    y += 10;
    doc.setFillColor(...lightgray); doc.roundedRect(14, y, W-28, 42, 2, 2, 'F');
    doc.setTextColor(...navy); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    const descLines = doc.splitTextToSize(data.description || '', W-38);
    descLines.slice(0, 7).forEach((line: string, i: number) => { doc.text('> ' + line, 20, y+8+i*5.5); });
    y += 50;

    doc.setFillColor(...navy); doc.roundedRect(14, y, W-28, 8, 2, 2, 'F');
    doc.setTextColor(...white); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('FORME JURIDIQUE — ' + (data.forme_juridique || ''), 20, y+5.5);
    y += 10;
    const formeDetails: Record<string, string[]> = {
      'Auto-entrepreneur': ['Inscription en ligne — simple et rapide', 'Plafond CA: 500 000 MAD (services)', 'IR liberatoire: 1% (ventes) / 2% (services)', 'Pas de TVA en dessous des seuils', 'Ideal pour demarrage solo'],
      'SARL AU': ['Capital minimum: 1 MAD', 'Associe unique, responsabilite limitee', 'IS: 10% jusqu a 300 000 MAD de benefice', 'TVA selon regime (mensuel/trimestriel)', 'Registre commerce obligatoire'],
      'SARL': ['Plusieurs associes (2 minimum)', 'Capital minimum: 1 MAD', 'Decisions collectives en AGE/AGO', 'IS selon bareme progressif', 'Ideal pour s associer'],
      'SA': ['Capital minimum: 300 000 MAD', 'Ideal pour levee de fonds', 'Conseil d administration obligatoire', 'Commissaire aux comptes requis', 'Acces facilite aux marches publics'],
    };
    const formeKey = Object.keys(formeDetails).find(k => (data.forme_juridique||'').includes(k)) || 'SARL AU';
    const details = formeDetails[formeKey];
    doc.setFillColor(...lightgray); doc.roundedRect(14, y, W-28, 32, 2, 2, 'F');
    details.forEach((d, i) => {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...navy);
      doc.text('✓  ' + d, 20, y+8+i*5);
    });

    addFooter(2, TOTAL_PAGES);

    // ══ PAGE 3 — TABLEAU DE BORD FINANCIER ══
    doc.addPage(); addHeader('TABLEAU DE BORD FINANCIER', 'Indicateurs cles de performance et analyse de rentabilite');
    y = 30;

    const kpis = [
      { label: 'CA MENSUEL VISE', value: `${fmt(financials.ca||0)} MAD`, sub: `Annuel: ${((financials.ca||0)*12)} MAD`, color: blue },
      { label: 'RESULTAT NET/MOIS', value: `${fmt(financials.resultatMensuel||0)} MAD`, sub: `Annuel: ${fmt(financials.resultatAnnuel||0)} MAD`, color: (financials.resultatMensuel||0) > 0 ? green : red },
      { label: 'RENTABILITE', value: `${financials.rentabilite||0}%`, sub: 'Taux de marge nette', color: [124, 58, 237] as [number,number,number] },
      { label: 'DELAI RETOUR', value: `${financials.payback||0} mois`, sub: 'Payback period', color: [217, 119, 6] as [number,number,number] },
    ];

    kpis.forEach((kpi, i) => {
      const kx = 14 + (i % 2) * 96; const ky = y + Math.floor(i / 2) * 32;
      doc.setFillColor(...kpi.color); doc.roundedRect(kx, ky, 88, 26, 3, 3, 'F');
      doc.setTextColor(...white); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.text(kpi.label, kx+5, ky+8);
      doc.setFontSize(13); doc.text(kpi.value, kx+5, ky+18);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text(kpi.sub, kx+5, ky+24);
    });

    y += 72;

    drawBarChart(14, y, 85, 40,
      [financials.loyer||0, financials.totalSalaires||0, financials.cnssPatronal||0, financials.charges||0],
      ['Loyer', 'Salaires', 'CNSS', 'Autres'],
      [[37,99,235], [21,128,61], [217,119,6], [124,58,237]],
      'REPARTITION DES CHARGES (MAD/mois)'
    );

    drawBarChart(112, y, 84, 40,
      [(financials.ca||0)*12, (financials.ca||0)*12*1.2, (financials.ca||0)*12*1.2*1.15],
      ['Annee 1', 'Annee 2', 'Annee 3'],
      [[37,99,235], [21,128,61], [251,191,36]],
      'PREVISION CA 3 ANS (MAD)'
    );

    y += 58;

    autoTable(doc, {
      startY: y,
      head: [['POSTE DE CHARGES', 'MENSUEL (MAD)', 'ANNUEL (MAD)', '% DU TOTAL']],
      body: [
        ['Loyer', fmt(financials.loyer||0), ((financials.loyer||0)*12), `${financials.totalCharges ? (((financials.loyer||0)/financials.totalCharges)*100).toFixed(1) : 0}%`],
        ['Salaires bruts', fmt(financials.totalSalaires||0), ((financials.totalSalaires||0)*12), `${financials.totalCharges ? (((financials.totalSalaires||0)/financials.totalCharges)*100).toFixed(1) : 0}%`],
        ['CNSS patronal (21.26%)', (financials.cnssPatronal||0).toFixed(0), ((financials.cnssPatronal||0)*12).toFixed(0), `${financials.totalCharges ? (((financials.cnssPatronal||0)/financials.totalCharges)*100).toFixed(1) : 0}%`],
        ['AMO patronal (2.03%)', (financials.amoPatronal||0).toFixed(0), ((financials.amoPatronal||0)*12).toFixed(0), `${financials.totalCharges ? (((financials.amoPatronal||0)/financials.totalCharges)*100).toFixed(1) : 0}%`],
        ['Autres charges', fmt(financials.charges||0), ((financials.charges||0)*12), `${financials.totalCharges ? (((financials.charges||0)/financials.totalCharges)*100).toFixed(1) : 0}%`],
        ['TOTAL CHARGES', fmt(financials.totalCharges||0), ((financials.totalCharges||0)*12), '100%'],
      ],
      headStyles: { fillColor: navy, textColor: white, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: lightgray },
      columnStyles: { 0: { fontStyle: 'bold' } },
    });

    addFooter(3, TOTAL_PAGES);

    // ══ PAGE 4 — COMPTE DE RESULTAT ══
    doc.addPage(); addHeader('PLAN FINANCIER PREVISIONNEL 3 ANS', 'Compte de resultat, fiscalite et flux de tresorerie');

    const ca1 = (financials.ca||0) * 12;
    const ca2 = ca1 * 1.2; const ca3 = ca2 * 1.15;
    const ch1 = (financials.totalCharges||0) * 12;
    const ch2 = ch1 * 1.1; const ch3 = ch2 * 1.05;
    const r1 = ca1 - ch1; const r2 = ca2 - ch2; const r3 = ca3 - ch3;
    const is1 = r1 > 0 ? (r1 <= 300000 ? r1*0.10 : r1 <= 1000000 ? r1*0.20 : r1*0.26) : 0;
    const is2 = r2 > 0 ? (r2 <= 300000 ? r2*0.10 : r2 <= 1000000 ? r2*0.20 : r2*0.26) : 0;
    const is3 = r3 > 0 ? (r3 <= 300000 ? r3*0.10 : r3 <= 1000000 ? r3*0.20 : r3*0.26) : 0;

    autoTable(doc, {
      startY: 30,
      head: [['COMPTE DE RESULTAT', 'ANNEE 1', 'ANNEE 2 (+20%)', 'ANNEE 3 (+15%)']],
      body: [
        ['Chiffre d affaires HT', `${ca1} MAD`, `${ca2} MAD`, `${ca3} MAD`],
        ['TVA collectee (20%)', `${fmt(ca1*0.2)} MAD`, `${fmt(ca2*0.2)} MAD`, `${fmt(ca3*0.2)} MAD`],
        ['Total charges exploitation', `${ch1} MAD`, `${ch2} MAD`, `${ch3} MAD`],
        ['Resultat avant IS', `${r1} MAD`, `${r2} MAD`, `${r3} MAD`],
        ['Impot sur Societes (IS)', `${is1} MAD`, `${is2} MAD`, `${is3} MAD`],
        ['RESULTAT NET', `${fmt(r1-is1)} MAD`, `${fmt(r2-is2)} MAD`, `${fmt(r3-is3)} MAD`],
        ['Marge nette %', `${ca1 > 0 ? (((r1-is1)/ca1)*100).toFixed(1) : 0}%`, `${ca2 > 0 ? (((r2-is2)/ca2)*100).toFixed(1) : 0}%`, `${ca3 > 0 ? (((r3-is3)/ca3)*100).toFixed(1) : 0}%`],
      ],
      headStyles: { fillColor: navy, textColor: white, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: lightgray },
      columnStyles: { 0: { fontStyle: 'bold' } },
    });

    const yf = ((doc as DocWithAutoTable).lastAutoTable?.finalY ?? 30) + 12;
    autoTable(doc, {
      startY: yf,
      head: [['OBLIGATION FISCALE / SOCIALE', 'FREQUENCE', 'MONTANT ESTIME', 'ORGANISME']],
      body: [
        ['Declaration TVA', 'Mensuelle', `${((financials.ca||0)*0.20)} MAD`, 'DGI / SIMPL'],
        ['Acomptes IS (4 fois/an)', 'Trimestrielle', `${fmt(is1/4)} MAD`, 'DGI'],
        ['CNSS salariale (4.48%)', 'Mensuelle', `${((financials.totalSalaires||0)*0.0448).toFixed(0)} MAD`, 'CNSS'],
        ['CNSS patronale (21.26%)', 'Mensuelle', `${(financials.cnssPatronal||0).toFixed(0)} MAD`, 'CNSS'],
        ['AMO patronale (2.03%)', 'Mensuelle', `${(financials.amoPatronal||0).toFixed(0)} MAD`, 'CNSS'],
        ['Declaration IR salaires', 'Annuelle (Jan)', 'Variable', 'DGI'],
        ['Bilan comptable', 'Annuelle (Avr)', 'Honoraires comptable', 'DGI'],
        ['Patente', 'Annuelle', 'Selon CA', 'Mairie'],
      ],
      headStyles: { fillColor: [30, 80, 130] as [number,number,number], textColor: white, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: lightgray },
    });

    addFooter(4, TOTAL_PAGES);

    // ══ PAGE 5 — SWOT ══
    doc.addPage(); addHeader('ANALYSE SWOT', 'Forces, Faiblesses, Opportunites et Menaces du projet');

    const swotData = [
      { title: 'FORCES', color: [21,128,61] as [number,number,number], bg: [220,252,231] as [number,number,number], items: [
        `Experience: ${(data.experience||'').substring(0,50)}`,
        `Capital disponible: ${(parseFloat(data.capital||'0'))} MAD`,
        `Localisation: ${data.ville} — marche porteur`,
        `Forme juridique adaptee: ${data.forme_juridique}`,
        'Differenciation: ' + (data.description||'').substring(0,40),
      ]},
      { title: 'FAIBLESSES', color: [185,28,28] as [number,number,number], bg: [254,226,226] as [number,number,number], items: [
        'Phase de demarrage — notoriete a construire',
        `Charges fixes: ${fmt(financials.totalCharges||0)} MAD/mois des J1`,
        'Dependance aux premiers clients',
        'Besoin de financement externe',
        'Ressources humaines limitees au demarrage',
      ]},
      { title: 'OPPORTUNITES', color: [37,99,235] as [number,number,number], bg: [219,234,254] as [number,number,number], items: [
        `Marche ${data.secteur} en croissance au Maroc`,
        'Programmes: Intelaka, Hassan II, OFPPT',
        'Digitalisation des entreprises marocaines',
        `Bassin emploi favorable a ${data.ville}`,
        'Acces aux marches CEDEAO et UE',
      ]},
      { title: 'MENACES', color: [217,119,6] as [number,number,number], bg: [254,243,199] as [number,number,number], items: [
        'Concurrence locale etablie',
        'Fluctuations economiques',
        'Evolution de la reglementation fiscale',
        'Difficultes acces financement bancaire',
        'Inflation des matieres premieres',
      ]},
    ];

    swotData.forEach((swot, i) => {
      const sx = 14 + (i % 2) * 96; const sy = 30 + Math.floor(i / 2) * 110;
      doc.setFillColor(...swot.bg); doc.roundedRect(sx, sy, 88, 100, 3, 3, 'F');
      doc.setFillColor(...swot.color); doc.roundedRect(sx, sy, 88, 14, 3, 3, 'F');
      doc.rect(sx, sy+8, 88, 6, 'F');
      doc.setTextColor(...white); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(swot.title, sx+44, sy+9, { align: 'center' });
      swot.items.forEach((item, j) => {
        doc.setTextColor(30, 30, 30); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        const wrapped = doc.splitTextToSize(`• ${item}`, 80);
        wrapped.slice(0,2).forEach((line: string, k: number) => {
          doc.text(line, sx+4, sy+22+j*15+k*6);
        });
      });
    });

    addFooter(5, TOTAL_PAGES);

    // ══ PAGE 6 — PLAN D ACTION ══
    doc.addPage(); addHeader("PLAN D'ACTION ET CALENDRIER", 'Etapes de creation et lancement du projet');

    const steps = [
      { phase: 'PHASE 1 — CREATION (Mois 1-2)', color: navy, items: [
        'Obtenir le certificat negatif aupres du RC',
        'Rediger et signer les statuts de la societe',
        'Deposer le capital au compte bancaire bloque',
        'Immatriculer au Registre de Commerce',
        'Obtenir IF, ICE et numero CNSS',
        'Ouvrir le compte bancaire professionnel',
      ]},
      { phase: 'PHASE 2 — DEMARRAGE (Mois 3-4)', color: [30,80,130] as [number,number,number], items: [
        'Trouver et amenager le local commercial',
        'Recruter et former les premiers employes',
        'Declarer a la CNSS et DGI',
        'Mettre en place la comptabilite',
        'Lancer la communication et le marketing',
        'Contacter les premiers clients / fournisseurs',
      ]},
      { phase: 'PHASE 3 — CROISSANCE (Mois 5-12)', color: green, items: [
        `Atteindre le seuil de rentabilite: ${fmt(financials.totalCharges||0)} MAD/mois`,
        'Soumettre les declarations TVA mensuelles',
        `Viser le CA mensuel de ${fmt(financials.ca||0)} MAD`,
        'Fideliser la clientele — programme fidelite',
        'Bilan 6 mois et ajustement strategique',
        'Preparer les acomptes IS (juin et septembre)',
      ]},
    ];

    let yp = 30;
    steps.forEach((step) => {
      doc.setFillColor(...step.color); doc.roundedRect(14, yp, W-28, 10, 2, 2, 'F');
      doc.setTextColor(...white); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(step.phase, 20, yp+7);
      yp += 12;
      step.items.forEach((item, j) => {
        if (j % 2 === 0) doc.setFillColor(...lightgray); else doc.setFillColor(...white);
        doc.rect(14, yp, W-28, 9, 'F');
        doc.setFillColor(...step.color); doc.rect(14, yp, 3, 9, 'F');
        doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(`  ${j+1}. ${item}`, 20, yp+6);
        yp += 9;
      });
      yp += 10;
    });

    addFooter(6, TOTAL_PAGES);

    // ══ PAGE 7 — ETUDE COMPLETE AI ══
    doc.addPage(); addHeader('ANALYSE EXPERTE COMPLETE', `Etude de faisabilite — ${data.nom_projet || 'Projet'}`);

    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(etude.replace(/\*\*/g, '').replace(/#{1,3} /g, '').replace(/══+/g, ''), 178);
    let yl = 30;
    let currentPage = 7;
    lines.forEach((line: string) => {
      if (yl > 278) {
        addFooter(currentPage, TOTAL_PAGES);
        doc.addPage();
        currentPage++;
        addHeader('ANALYSE EXPERTE (suite)', data.nom_projet || '');
        yl = 30;
      }
      if (line.match(/^\d+\.\s+[A-Z]/) || (line.toUpperCase() === line && line.trim().length > 3 && !line.includes('MAD') && !line.includes('%'))) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy); yl += 4;
      } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50);
      }
      doc.text(line, 14, yl);
      yl += 5;
    });

    addFooter(currentPage, TOTAL_PAGES);
    doc.save(`etude_${data.nom_projet || 'projet'}_${new Date().getFullYear()}.pdf`);
  };

  const progress = Math.min((step / questions.length) * 100, 100);

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar
        variant="module"
        footer={
          <div className="px-4 py-4 border-t border-white/10 space-y-3">
            <div>
              <p className="text-white/30 text-xs mb-1">Progression</p>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div className="bg-amber-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-white/40 text-xs mt-1">
                {step}/{questions.length} questions
              </p>
            </div>
            {companyData.raisonSociale && (
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/30 text-xs mb-1 flex items-center gap-1">
                  <CheckCircle size={10} className="text-green-400" /> Donnees societe
                </p>
                <p className="text-white/70 text-xs font-medium">{companyData.raisonSociale}</p>
                {companyData.if_fiscal && <p className="text-white/30 text-xs">IF: {companyData.if_fiscal}</p>}
                {companyData.ice && <p className="text-white/30 text-xs">ICE: {companyData.ice}</p>}
                {companyData.rc && <p className="text-white/30 text-xs">RC: {companyData.rc}</p>}
              </div>
            )}
            <div className="space-y-1">
              {questions.slice(0, step).map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle size={10} className="text-green-400 shrink-0" />
                  <p className="text-white/30 text-xs truncate">{data[q.key]}</p>
                </div>
              ))}
            </div>
          </div>
        }
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
              <BarChart2 size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Etude de Faisabilite du Projet</h1>
              <p className="text-xs text-gray-400">Document professionnel · Pret pour banque / investisseur / Intelaka</p>
            </div>
          </div>
          {etudeReady && (
            <button onClick={downloadPDF} className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] transition-colors">
              <Download size={16} /> PDF Professionnel (7 pages)
            </button>
          )}
        </header>

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && (
                    <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shrink-0 mt-1">
                      <Bot size={16} className="text-white" />
                    </div>
                  )}
                  <div className={`max-w-lg px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    m.role === 'user' ? 'bg-[#1B2A4A] text-white rounded-tr-none' : 'bg-white text-gray-700 shadow-sm border border-gray-100 rounded-tl-none'
                  }`}>
                    {m.content}
                  </div>
                  {m.role === 'user' && (
                    <div className="w-8 h-8 bg-[#1B2A4A] rounded-full flex items-center justify-center shrink-0 mt-1">
                      <User size={16} className="text-white" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex gap-1 items-center">
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{animationDelay:'0.1s'}}></div>
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}></div>
                      <span className="text-xs text-gray-400 ml-2">Generation en cours...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {step < questions.length && (
              <div className="bg-white border-t border-gray-200 px-6 py-4">
                <div className="flex gap-3">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    placeholder="Votre reponse..."
                    className="flex-1 px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-amber-400"
                    autoFocus
                  />
                  <button onClick={sendMessage} disabled={loading} className="px-4 py-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50">
                    <Send size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {etudeReady && (
            <div className="w-96 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
              <div className="bg-[#0F1F3D] px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-400" />
                  <p className="text-white font-semibold text-sm">Apercu Etude</p>
                </div>
                <button onClick={downloadPDF} className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-xs">
                  <Download size={12} /> PDF
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 border-b border-gray-200">
                <div className="bg-blue-500 rounded-lg p-2 text-white text-center">
                  <p className="text-xs opacity-70">CA/mois</p>
                  <p className="font-bold text-sm">{fmt(financials.ca||0)} MAD</p>
                </div>
                <div className={`${(financials.resultatMensuel||0) > 0 ? 'bg-green-500' : 'bg-red-500'} rounded-lg p-2 text-white text-center`}>
                  <p className="text-xs opacity-70">Resultat</p>
                  <p className="font-bold text-sm">{fmt(financials.resultatMensuel||0)} MAD</p>
                </div>
                <div className="bg-purple-500 rounded-lg p-2 text-white text-center">
                  <p className="text-xs opacity-70">Rentabilite</p>
                  <p className="font-bold text-sm">{financials.rentabilite||0}%</p>
                </div>
                <div className="bg-amber-500 rounded-lg p-2 text-white text-center">
                  <p className="text-xs opacity-70">Payback</p>
                  <p className="font-bold text-sm">{financials.payback||0} mois</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 text-xs text-gray-600 leading-relaxed whitespace-pre-line">
                {etude}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

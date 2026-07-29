'use client';
import { useState, useEffect } from 'react';
import type { ParagraphChild } from 'docx';
import { ArrowLeft, FileText, Download, Search, Building2, RefreshCw, ChevronRight, CheckCircle, Loader2 } from 'lucide-react';
import { fetchAi } from '../lib/fetch-ai';
import { createAtlasLink } from '@/app/lib/atlas-links-repository';
import { createDocument } from '@/app/lib/atlas-documents-repository';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { JuridiqueDocumentsPanel } from '@/app/juridique/JuridiqueDocumentsPanel';
import { JuridiquePvGeneratorPanel } from '@/app/juridique/JuridiquePvGeneratorPanel';
import { CorporateVaultPanel } from '@/app/juridique/CorporateVaultPanel';
import { JuridiqueFormalitesPanel } from '@/app/juridique/JuridiqueFormalitesPanel';
import { JuridiqueModuleTabs, type JuridiqueTabId } from '@/app/juridique/JuridiqueModuleTabs';
import { EntityAuditTable } from '@/app/components/history/EntityAuditTable';
import { persistLegalDocument } from '@/app/juridique/juridique-persist';

type Company = {
  id: number; raisonSociale: string; formeJuridique: string; if_fiscal: string;
  ice: string; rc: string; cnss: string; adresse: string; ville: string;
  telephone: string; email: string; activite: string; regimeTVA: string; actif: boolean;
};

type GeneratedDoc = {
  id: string; name: string; content: string; status: 'pending' | 'generating' | 'done' | 'error';
};

type FormData = {
  associes: string; capital: string; activite: string; gerant: string; cin_gerant: string;
  adresse_gerant: string; date_naissance_gerant: string; date: string;
};

const cleanText = (text: string) => text
  .replace(/\*\*/g, '').replace(/#{1,3} /g, '').replace(/```[\s\S]*?```/g, '')
  .replace(/`/g, '').replace(/%[A-Z]/g, '').replace(/\[.*?\]/g, '')
  .replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').replace(/\|/g, ' ').trim();

const callAI = async (message: string) => {
  const res = await fetchAi({ type: 'juridique', message });
  const data = (await res.json().catch(() => ({}))) as { response?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Erreur ${res.status}`);
  }
  return data.response as string;
};

const isCenteredLine = (t: string): boolean => {
  if (!t || t.length < 2) return false;
  if (t.startsWith('SOCIETE A RESPONSABILITE')) return true;
  if (t.startsWith('SIEGE SOCIAL:')) return true;
  if (t === 'STATUTS') return true;
  if (t === 'CESSION DE PARTS SOCIALES') return true;
  if (t.startsWith('CONTRAT DE')) return true;
  if (t.startsWith('PROCES-VERBAL')) return true;
  if (t.startsWith('DECISION EXTRAORDINAIRE')) return true;
  if (t === 'LES ASSOCIES') return true;
  if (t === "D'UNE PART") return true;
  if (t === "D'AUTRE PART") return true;
  if (t === 'DONT QUITTANCE') return true;
  const isAllCaps = t === t.toUpperCase();
  const noFiscal = !t.includes('MAD') && !t.includes(' IF') && !t.includes(' ICE') && !t.includes(' RC') && !t.includes('N°');
  const noPrefix = !t.startsWith('ARTICLE') && !t.startsWith('TITRE') && !t.startsWith('IL ') && !t.startsWith('LE ') && !t.startsWith('LA ') && !t.startsWith('FAIT') && !t.startsWith('ENTRE') && !t.startsWith('PAR ');
  return isAllCaps && noFiscal && noPrefix && t.length < 80;
};

// ========== WORD GENERATORS ==========

const generateWordDoc = async (content: string, filename: string) => {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } = await import('docx');
  const clean = cleanText(content);
  const paragraphs = clean.split('\n').map(line => {
    const t = line.trim();
    if (!t) return new Paragraph({ text: '', spacing: { after: 80 } });
    const centered = isCenteredLine(t);
    if (t.startsWith('TITRE')) return new Paragraph({
      heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: t, bold: true, size: 22, color: '0F1F3D' })],
      spacing: { before: 240, after: 120 }
    });
    if (t.startsWith('ARTICLE')) return new Paragraph({
      children: [new TextRun({ text: t, bold: true, size: 20, color: '0F1F3D' })],
      spacing: { before: 160, after: 80 }
    });
    if (centered) return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: t, bold: true, size: 20 })],
      spacing: { before: 120, after: 120 }
    });
    return new Paragraph({
      children: [new TextRun({ text: t, size: 18 })],
      spacing: { after: 80 }
    });
  });
  const doc = new Document({
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, children: paragraphs }]
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const generateDepotLegalWord = async (company: Company, formData: FormData, gerant: string) => {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, ShadingType } = await import('docx');

  const border = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const borders = { top: border, bottom: border, left: border, right: border };

  const bold = (text: string, size = 20) => new TextRun({ text, bold: true, size, font: 'Arial' });
  const normal = (text: string, size = 18) => new TextRun({ text, size, font: 'Arial' });
  const center = (children: ParagraphChild[], spacing = { after: 80 }) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children, spacing });
  const left = (children: ParagraphChild[], spacing = { after: 80 }) => new Paragraph({ children, spacing });

  const children = [
    // Header
    center([bold('ROYAUME DU MAROC        MINISTRE DE LA JUSTICE', 20)]),
    center([bold(`TRIBUNAL DE PREMIERE INSTANCE DE ${company.ville.toUpperCase()}`, 18)]),
    new Paragraph({ spacing: { after: 40 } }),
    center([bold(`RC N° : ${company.rc}`, 22)]),
    new Paragraph({ spacing: { after: 40 } }),
    center([bold('REGISTRE DE COMMERCE', 24)]),
    center([bold('Dépôt légal', 22)]),
    new Paragraph({ spacing: { after: 160 } }),

    // Table 1: Rappel identification
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [2000, 7026],
      rows: [
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 9026, type: WidthType.DXA }, columnSpan: 2,
            shading: { fill: 'D0D0D0', type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [bold('RAPPEL D\'IDENTIFICATION AVANT MODIFICATION')] })]
          })
        ]}),
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [
              left([normal('Société')]),
              left([normal('Forme juridique')]),
              left([normal('Siège social')]),
              left([normal('Capital')]),
            ]
          }),
          new TableCell({ borders, width: { size: 7026, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [
              left([normal(': ' + company.raisonSociale)]),
              left([normal(': ' + company.formeJuridique)]),
              left([normal(': ' + company.adresse + ' ' + company.ville)]),
              left([normal(': ' + formData.capital + ' DHS')]),
            ]
          }),
        ]}),
      ]
    }),
    new Paragraph({ spacing: { after: 120 } }),

    // Personnes autorisees
    left([bold('Liste des personnes autorisées à administrer, gérer ou signer pour la société :')]),
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [4513, 4513],
      rows: [
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 4513, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [bold('NOM & PRENOM')] })]
          }),
          new TableCell({ borders, width: { size: 4513, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [bold('NOM & PRENOM')] })]
          }),
        ]}),
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 4513, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [
              left([normal(`1. Mr. ${gerant}`)]),
              left([normal('2. ………………………………………')]),
              left([normal('3. ………………………………………')]),
            ]
          }),
          new TableCell({ borders, width: { size: 4513, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [
              left([normal('1. ………………………………………')]),
              left([normal('2. ………………………………………')]),
              left([normal('3. ………………………………………')]),
            ]
          }),
        ]}),
      ]
    }),
    new Paragraph({ spacing: { after: 120 } }),

    // Objet
    left([bold('Objet :'), normal('        CONSTITUTION DE SOCIETE')]),
    new Paragraph({ spacing: { after: 80 } }),

    // Decisions de modification
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [9026],
      rows: [
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 9026, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            shading: { fill: 'D0D0D0', type: ShadingType.CLEAR },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [bold('DECISIONS DE MODIFICATION')] })]
          })
        ]}),
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 9026, type: WidthType.DXA }, margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [normal('CONSTITUTION DE SOCIETE')] })]
          })
        ]}),
      ]
    }),
    new Paragraph({ spacing: { after: 120 } }),

    // Pieces jointes
    left([bold('Pièces jointes : (*)')]),
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [2500, 1500, 1500, 1500, 2026],
      rows: [
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 2500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, shading: { fill: 'D0D0D0', type: ShadingType.CLEAR },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [bold('Type / forme')] })] }),
          new TableCell({ borders, width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, shading: { fill: 'D0D0D0', type: ShadingType.CLEAR },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [bold('Original')] })] }),
          new TableCell({ borders, width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, shading: { fill: 'D0D0D0', type: ShadingType.CLEAR },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [bold('Copie')] })] }),
          new TableCell({ borders, width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, shading: { fill: 'D0D0D0', type: ShadingType.CLEAR },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [bold('Exped')] })] }),
          new TableCell({ borders, width: { size: 2026, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, shading: { fill: 'D0D0D0', type: ShadingType.CLEAR },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [bold("Date de l'original")] })] }),
        ]}),
        ...['Statuts', 'PV', 'RC', 'ACT'].map(type => new TableRow({ children: [
          new TableCell({ borders, width: { size: 2500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [normal(type)] })] }),
          new TableCell({ borders, width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [normal('')] })] }),
          new TableCell({ borders, width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [normal('')] })] }),
          new TableCell({ borders, width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [normal('')] })] }),
          new TableCell({ borders, width: { size: 2026, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [normal('│_│_│ │_│_│ │_│_│_│_│')] })] }),
        ]})),
      ]
    }),
    new Paragraph({ spacing: { after: 120 } }),

    // Deposant
    left([normal('Déposant : Nom & Prénoms : '), normal(gerant)]),
    new Paragraph({ spacing: { after: 160 } }),

    // Signature
    left([normal(`Le secrétaire-Greffier en chef du Tribunal de Première Instance de ${company.ville}, certifie que les pièces susvisées ont été déposées à ce secrétariat-greffe sous le N° : ………………`)]),
    new Paragraph({ spacing: { after: 80 } }),
    left([normal(`${company.ville} le ${formData.date}`)]),
    new Paragraph({ spacing: { after: 80 } }),
    center([bold('Le secrétaire-greffier')]),
  ];

  const doc = new Document({
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, children }]
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `depot_legal_${company.raisonSociale.replace(/ /g, '_')}.docx`; a.click();
  URL.revokeObjectURL(url);
};

const generateRCWord = async (company: Company, formData: FormData) => {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, ShadingType, PageOrientation } = await import('docx');

  const border = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  const b = (text: string, size = 18) => new TextRun({ text, bold: true, size, font: 'Arial' });
  const n = (text: string, size = 16) => new TextRun({ text, size, font: 'Arial' });
  const pc = (children: ParagraphChild[], spacing = { after: 60 }) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children, spacing });
  const pl = (children: ParagraphChild[], spacing = { after: 60 }) => new Paragraph({ children, spacing });

  // ======= PAGE 1: GAUCHE (NOTA + Cadres) =======
  const page1Children = [
    // Header 3 colonnes
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [2500, 3526, 3000],
      rows: [new TableRow({ children: [
        new TableCell({ borders: noBorders, width: { size: 2500, type: WidthType.DXA }, children: [
          pl([b('ROYAUME DU MAROC', 16)]),
          pl([b('MINISTERE DE LA JUSTICE', 16)]),
          pl([n(`TRIBUNAL DE ${company.ville.toUpperCase()}`, 14)]),
        ]}),
        new TableCell({ borders: noBorders, width: { size: 3526, type: WidthType.DXA }, children: [
          pc([b('REGISTRE DE COMMERCE', 16)]),
          pc([b("DECLARATION D'IMMATRICULATION", 14)]),
          pc([n('(Articles 45 et 46 du code de commerce)', 12)]),
          pc([b('* * *', 12)]),
          pc([b('SOCIETES COMMERCIALES', 14)]),
          pc([n('(Article 37 du code de commerce)', 12)]),
        ]}),
        new TableCell({ borders: noBorders, width: { size: 3000, type: WidthType.DXA }, children: [
          pl([n('Décret du 9 Ramadan 1417', 12)]),
          pl([n('(18/1/1997)', 12)]),
          pl([n('Article 2', 12)]),
        ]}),
      ]})]
    }),
    new Paragraph({ spacing: { after: 120 } }),

    // NOTA box
    new Table({
      width: { size: 9026, type: WidthType.DXA }, columnWidths: [9026],
      rows: [new TableRow({ children: [new TableCell({
        borders,
        width: { size: 9026, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          pc([b('NOTA', 18)]),
          pc([b('* * *', 14)]),
          pl([n("La présente déclaration doit être rédigée en triple exemplaire, de façon très lisible, dactylographiée et signée par le requérant ou par son Mandataire muni d une procuration qui est conservée par le greffier.", 13)]),
          pl([n('La déclaration doit être accompagnée des pièces justificatives exigées.', 13)]),
          pl([n("Nul assujetti ou société commerciale ne peut être immatriculé à titre principal dans plusieurs registres locaux ou dans un même registre local Sous plusieurs numéros (Art.39 du code de commerce)", 13)]),
          pl([n("Toute indication inexacte donnée de mauvaise foi en vue de l immatriculation ou de l inscription au registre du commerce est punie d un Emprisonnement d un mois à un an et d une amende de 1.000 à 50.000 dirhams ou de l une de ces deux peines seulement (Art.64 du code de commerce).", 13)]),
          pl([n("L immatriculation d une société ne peut être requise que par les gérants ou par les membres des organes d administration, de direction ou de gestion, (article 38-2ème alinéa du code de commerce)", 13)]),
        ]
      })]})]
    }),
    new Paragraph({ spacing: { after: 80 } }),

    // N° immatriculation
    pl([n("N° d'immatriculation ................  Raison sociale ou dénomination ....................", 13)]),
    new Paragraph({ spacing: { after: 60 } }),

    // Cadre greffier
    new Table({
      width: { size: 9026, type: WidthType.DXA }, columnWidths: [9026],
      rows: [
        new TableRow({ children: [new TableCell({ borders, width: { size: 9026, type: WidthType.DXA }, shading: { fill: 'D0D0D0', type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [pc([b('Cadre réservé au greffier', 14)])] })]}),
        new TableRow({ children: [new TableCell({ borders, width: { size: 9026, type: WidthType.DXA }, margins: { top: 60, bottom: 80, left: 120, right: 120 }, children: [
          pl([n('Actes et pièces déposés le .............. h .............. sous n° ..............  Pièces justificatives', 13)]),
          pl([n('Déclaration déposée le .............. sous n° .............. au registre chronologique.', 13)]),
          pl([n("La conformité de la déclaration ci-dessus avec les pièces justificatives produites en application des règlements a été vérifiée par le secrétaire-greffier soussigné qui a procédé en conséquence à l immatriculation demandée, laquelle a reçu le numéro .............. au registre analytique", 13)]),
          new Paragraph({ spacing: { after: 40 } }),
          pc([b('Le secrétaire-greffier', 14)]),
        ]})]}),
      ]
    }),
    new Paragraph({ spacing: { after: 80 } }),

    // Cadre registre central
    new Table({
      width: { size: 9026, type: WidthType.DXA }, columnWidths: [9026],
      rows: [
        new TableRow({ children: [new TableCell({ borders, width: { size: 9026, type: WidthType.DXA }, shading: { fill: 'D0D0D0', type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [pc([b('Cadre réservé au registre central', 14)])] })]}),
        new TableRow({ children: [new TableCell({ borders, width: { size: 9026, type: WidthType.DXA }, margins: { top: 60, bottom: 120, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 200 } })] })]}),
      ]
    }),
  ];

  // ======= PAGE 2: DROITE (Declaration) =======
  const page2Children = [
    pc([b("Déclaration d'immatriculation au registre du commerce", 18)]),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [b('Modèle 2', 16)], spacing: { after: 80 } }),

    pl([n('1) Raison sociale ou dénomination '), b(company.raisonSociale, 16), n('  Enseigne ................................')], { after: 30 }),
    pl([n('Sigle .....  Date du certificat négatif '), n(formData.date, 16)], { after: 30 }),
    pl([n('2) Objet (sommaire) '), n(formData.activite, 16)], { after: 30 }),
    pl([n('3) Activité effectivement exercée '), n(formData.activite, 16), n('  Patente n° ................................')], { after: 30 }),
    pl([n('4) Siège social '), n(company.adresse + ' ' + company.ville, 16), n('  RC n° '), n(company.rc, 16)], { after: 30 }),
    pl([n('5) Succursale (au Maroc) ..............................')], { after: 30 }),
    pl([n("(A l'étranger (Ville, département et pays) ..............................")], { after: 30 }),
    pl([n('6) Forme juridique de la société '), n(company.formeJuridique, 16)], { after: 30 }),
    pl([n('7) Capital, montant '), n(formData.capital + ' DH', 16), n('  si capital variable, montant minimum ..............')], { after: 30 }),
    pl([n('8) Durée de la personne morale '), n('99 ans', 16), n('  Date de commencement d exploitation '), n(formData.date, 16)], { after: 30 }),
    pl([n('9) Numéro et date du dépôt des actes et pièces de la société .................................')], { after: 30 }),
    pl([n("10) Brevets d invention déposés le .............. n° de délivrance ......  Marques de fabrique, de commerce ou de service déposés le .............. sous n° ..............")], { after: 30 }),
    pl([n("11) Nom, prénoms, date, lieu de naissance, domicile, n CIN(1) a) des associés autres que les actionnaires b) des personnes autorisées à administrer, gérer et signer pour la société c)des gérants, membres des organes d administration de direction ou de gestion ou des directeurs.")], { after: 80 }),

    pc([b('PERSONNES PHYSIQUES', 16)]),
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [1800, 1800, 1200, 1200, 1626, 1400],
      rows: [
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pc([b('Nom et Prénoms', 13)])] }),
          new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pc([b('date et lieu de naissance', 13)])] }),
          new TableCell({ borders, width: { size: 1200, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pc([b('Nationalité', 13)])] }),
          new TableCell({ borders, width: { size: 1200, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pc([b('Qualité', 13)])] }),
          new TableCell({ borders, width: { size: 1626, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pc([b('Domicile', 13)])] }),
          new TableCell({ borders, width: { size: 1400, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pc([b('CIN(1)', 13)])] }),
        ]}),
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pl([n(formData.gerant, 13)])] }),
          new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pl([n(formData.date_naissance_gerant || '', 13)])] }),
          new TableCell({ borders, width: { size: 1200, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pl([n('Marocaine', 13)])] }),
          new TableCell({ borders, width: { size: 1200, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pl([n('Gérant', 13)])] }),
          new TableCell({ borders, width: { size: 1626, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pl([n(formData.adresse_gerant || '', 13)])] }),
          new TableCell({ borders, width: { size: 1400, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 }, children: [pl([n(formData.cin_gerant, 13)])] }),
        ]}),
        new TableRow({ children: [
          new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: { top: 60, bottom: 60 }, children: [new Paragraph({ spacing: { after: 40 } })] }),
          new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: { top: 60, bottom: 60 }, children: [new Paragraph({ spacing: { after: 40 } })] }),
          new TableCell({ borders, width: { size: 1200, type: WidthType.DXA }, margins: { top: 60, bottom: 60 }, children: [new Paragraph({ spacing: { after: 40 } })] }),
          new TableCell({ borders, width: { size: 1200, type: WidthType.DXA }, margins: { top: 60, bottom: 60 }, children: [new Paragraph({ spacing: { after: 40 } })] }),
          new TableCell({ borders, width: { size: 1626, type: WidthType.DXA }, margins: { top: 60, bottom: 60 }, children: [new Paragraph({ spacing: { after: 40 } })] }),
          new TableCell({ borders, width: { size: 1400, type: WidthType.DXA }, margins: { top: 60, bottom: 60 }, children: [new Paragraph({ spacing: { after: 40 } })] }),
        ]}),
      ]
    }),
    new Paragraph({ spacing: { after: 40 } }),
    pl([n("(1) pour les étrangers résidents au Maroc n° de la carte d immatriculation, pour les non résidents n° du passeport ou autre pièce d identité, en indiquant la date et le lieu de délivrance.", 12)]),
    new Paragraph({ spacing: { after: 60 } }),
    pl([n('Le soussigné '), n(formData.gerant, 16), n(' adresse personnelle '), n(formData.adresse_gerant || '', 16)]),
    pl([n('Qualité '), b('GERANT ET ASSOCIE UNIQUE', 16), n(" certifie l exactitude des indications portées sur la présente déclaration d immatriculation.")]),
    new Paragraph({ spacing: { after: 60 } }),
    pl([n('Pièces produites .................................')]),
    new Paragraph({ spacing: { after: 40 } }),
    new Table({
      width: { size: 9026, type: WidthType.DXA }, columnWidths: [4513, 4513],
      rows: [new TableRow({ children: [
        new TableCell({ borders: noBorders, width: { size: 4513, type: WidthType.DXA }, children: [pl([n('Cadre réservé à la légalisation de Signature')])] }),
        new TableCell({ borders: noBorders, width: { size: 4513, type: WidthType.DXA }, children: [
          pc([n('Fait en triple exemplaire')]),
          pc([n(`${company.ville} le ${formData.date}`)]),
          new Paragraph({ spacing: { after: 80 } }),
          pc([b('Le déclarant', 16)]),
        ]}),
      ]})]
    }),
  ];

  // Use 2 sections - page 1 left, page 2 right - both in landscape
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 567, right: 567, bottom: 567, left: 567 }
          }
        },
        children: page1Children
      },
      {
        properties: {
          page: {
            size: { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 567, right: 567, bottom: 567, left: 567 }
          }
        },
        children: page2Children
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `RC_${company.raisonSociale.replace(/ /g, '_')}.docx`; a.click();
  URL.revokeObjectURL(url);
};



// ==================== CREATION FORM ====================
function CreationForm({ companies }: { companies: Company[] }) {
  const [step, setStep] = useState<'select' | 'form' | 'generating' | 'done'>('select');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [search, setSearch] = useState('');
  const [standaloneCompany, setStandaloneCompany] = useState<Company>({
    id: 0,
    raisonSociale: '',
    formeJuridique: 'SARL',
    if_fiscal: '',
    ice: '',
    rc: '',
    cnss: '',
    adresse: '',
    ville: 'Casablanca',
    telephone: '',
    email: '',
    activite: '',
    regimeTVA: 'mensuel',
    actif: false,
  });
  const [formData, setFormData] = useState<FormData>({
    associes: '', capital: '', activite: '', gerant: '', cin_gerant: '',
    adresse_gerant: '', date_naissance_gerant: '', date: new Date().toLocaleDateString('fr-FR'),
  });
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [generationId] = useState<string>(() => crypto.randomUUID());
  const [linkStatus, setLinkStatus] = useState<string>('');
  const [linkCompanyId, setLinkCompanyId] = useState<number | ''>('');

  const filtered = companies.filter(c => c.raisonSociale.toLowerCase().includes(search.toLowerCase()));
  const docsToGenerate = [
    { id: 'statuts', name: 'Statuts SARL' },
    { id: 'pv_constitution', name: 'PV Constitution' },
    { id: 'domiciliation', name: 'Contrat Domiciliation' },
    { id: 'depot_legal', name: 'Dépôt Légal RC' },
    { id: 'rc_declaration', name: 'Déclaration RC (Modèle 2)' },
  ];

  const generateAll = async () => {
    const c = selectedCompany ?? standaloneCompany;
    if (!c.raisonSociale) return;
    setStep('generating');
    const docs: GeneratedDoc[] = docsToGenerate.map(d => ({ ...d, content: '', status: 'pending' as const }));
    setGeneratedDocs(docs);
    const f = formData;
    const base = `SOCIETE: ${c.raisonSociale} | SARL | Capital: ${f.capital} DH
IF: ${c.if_fiscal} | ICE: ${c.ice} | RC: ${c.rc} | CNSS: ${c.cnss}
Adresse siege: ${c.adresse} ${c.ville} | Tel: ${c.telephone}
Associes: ${f.associes} | Activite: ${f.activite}
Gerant: ${f.gerant} | CIN: ${f.cin_gerant} | Adresse: ${f.adresse_gerant} | Naissance: ${f.date_naissance_gerant}
Date acte: ${f.date}`;

    // STATUTS
    setGeneratedDocs(prev => prev.map(d => d.id === 'statuts' ? { ...d, status: 'generating' as const } : d));
    try {
      const p1 = await callAI(`Expert juridique marocain. Genere Titres I-IV statuts SARL.
${base}
EN-TETE: "${c.raisonSociale}" / "SOCIETE A RESPONSABILITE LIMITEE AU CAPITAL DE [EN LETTRES] ([CHIFFRES]) DIRHAMS" / "SIEGE SOCIAL: ${c.adresse} ${c.ville}" / "ICE: ${c.ice}   IF: ${c.if_fiscal}" / "STATUTS"
LES SOUSSIGNES: [chaque associe: NOM, nationalite marocaine, ne le [DATE] a [VILLE], demeurant [ADRESSE], CIN [N]]
"A etabli ainsi qu'il suit les statuts..."
TITRE PREMIER: Art.1 Formation (Dahir 1-97-49/loi 5-96 et Dahir 1-06-21/loi 21-05) - Art.2 Denomination ("${c.raisonSociale}" SARL + mentions ICE RC capital) - Art.3 Objet (${f.activite} en tirets) - Art.4 Siege (${c.adresse} ${c.ville}) - Art.5 Duree (99 ans)
TITRE II: Art.6 Apports - Art.7 Capital (${f.capital} DH en parts 100 DH avec repartition et numerotation) - Art.8 Augmentation/reduction - Art.9 Parts sociales - Art.10 Cession (libre entre associes, agrement tiers) - Art.11 Transmission
TITRE III: Art.12 Gerance (${f.gerant} CIN ${f.cin_gerant} gerant unique duree illimitee + 8 pouvoirs) - Art.13 Signature - Art.14 Remuneration
TITRE IV: Art.15 Vote - Art.16 AGO (3 mois, quorum 75%) - Art.17 Quorum - Art.18 AGE (unanimite) - Art.19 Registre
STOP apres article 19.`);
      const p2 = await callAI(`Expert juridique marocain. Genere Titres V-VII statuts SARL pour ${c.raisonSociale}.
${base}
TITRE V: Art.20 Exercice (1jan-31dec) - Art.21 Benefices (proportionnel parts) - Art.22 Comptes courants
TITRE VI: Art.23 Deces associe - Art.24 Deces/demission gerant - Art.25 Dissolution - Art.26 Liquidation
TITRE VII: Art.27 Contestation (tribunaux ${c.ville}) - Art.28 Publications - Art.29 Frais - Art.30 Transformation
"Les presents statuts seront deposes au Tribunal de Commerce de ${c.ville}."
"Fait a ${c.ville} le ${f.date}" / "LES ASSOCIES" / [signatures]`);
      setGeneratedDocs(prev => prev.map(d => d.id === 'statuts' ? { ...d, content: p1 + '\n\n' + p2, status: 'done' as const } : d));
    } catch { setGeneratedDocs(prev => prev.map(d => d.id === 'statuts' ? { ...d, status: 'error' as const } : d)); }

    // PV CONSTITUTION
    setGeneratedDocs(prev => prev.map(d => d.id === 'pv_constitution' ? { ...d, status: 'generating' as const } : d));
    try {
      const pv = await callAI(`Expert juridique marocain. Genere PV ASSEMBLEE GENERALE CONSTITUTIVE pour ${c.raisonSociale}.
${base}
EN-TETE: "${c.raisonSociale}" / "SARL AU CAPITAL DE [EN LETTRES] DIRHAMS" / "SIEGE: ${c.adresse} ${c.ville}" / "RC: ${c.rc}"
"PROCES-VERBAL DE L'ASSEMBLEE GENERALE CONSTITUTIVE TENUE LE ${f.date}"
"L'an [EN LETTRES], le [DATE EN LETTRES] a [HEURE], les associes se sont reunis..."
PREMIERE RESOLUTION: ADOPTION DES STATUTS - unanimite
DEUXIEME RESOLUTION: NOMINATION GERANT - ${f.gerant} CIN ${f.cin_gerant} duree illimitee - unanimite
TROISIEME RESOLUTION: POUVOIRS - porteur original pour immatriculation RC et publications - unanimite
"Fait a ${c.ville} le ${f.date}" / signatures associes`);
      setGeneratedDocs(prev => prev.map(d => d.id === 'pv_constitution' ? { ...d, content: pv, status: 'done' as const } : d));
    } catch { setGeneratedDocs(prev => prev.map(d => d.id === 'pv_constitution' ? { ...d, status: 'error' as const } : d)); }

    // DOMICILIATION
    setGeneratedDocs(prev => prev.map(d => d.id === 'domiciliation' ? { ...d, status: 'generating' as const } : d));
    try {
      const dom = await callAI(`Expert juridique marocain. Genere CONTRAT DE DOMICILIATION pour ${c.raisonSociale} selon modele article 93 CRCP.
${base}
"CONTRAT DE DOMICILIATION"
"Nous Soussignes, [DOMICILIATAIRE] SARL AU, declarant que ${c.raisonSociale} a domicilie son adresse fiscale dans nos locaux situes au ${c.adresse} ${c.ville}"
"Nous declarons avoir pris connaissance des dispositions article 93 CRCP..."
"CONDITIONS GENERALES DE DOMICILIATION JURIDIQUE ET FISCAL"
"[DOMICILIATAIRE] represente par [GERANT] CIN [N], et ${c.raisonSociale} represente par ${f.gerant} CIN ${f.cin_gerant} demeurant ${f.adresse_gerant}."
ARTICLE I CADRE LEGAL - ARTICLE II OBJET - ARTICLE III DUREE (1 an tacite reconduction preavis 1 mois) - ARTICLE IV OBLIGATIONS - ARTICLE V RESILIATION - ARTICLE VI ELECTION DOMICILE - ARTICLE VII PROCURATION
"Fait a ${c.ville} le ${f.date}" / signatures`);
      setGeneratedDocs(prev => prev.map(d => d.id === 'domiciliation' ? { ...d, content: dom, status: 'done' as const } : d));
    } catch { setGeneratedDocs(prev => prev.map(d => d.id === 'domiciliation' ? { ...d, status: 'error' as const } : d)); }

    // DEPOT LEGAL - generated as Word directly
    setGeneratedDocs(prev => prev.map(d => d.id === 'depot_legal' ? { ...d, status: 'done' as const, content: 'WORD_TABLE' } : d));

    // RC DECLARATION - generated as Word directly
    setGeneratedDocs(prev => prev.map(d => d.id === 'rc_declaration' ? { ...d, status: 'done' as const, content: 'WORD_TABLE' } : d));

    setStep('done');

    // Persist generated textual docs into Documents library (Word-only items stored as references)
    const toPersist = [
      { id: 'statuts', name: 'Statuts SARL' },
      { id: 'pv_constitution', name: 'PV Constitution' },
      { id: 'domiciliation', name: 'Contrat Domiciliation' },
      { id: 'depot_legal', name: 'Dépôt Légal RC' },
      { id: 'rc_declaration', name: 'Déclaration RC (Modèle 2)' },
    ];

    const persisted = new Map<string, string>();
    const generatedAt = new Date().toISOString();
    const linkCompany = selectedCompany;
    for (const d of toPersist) {
      const textContent = docs.find((x) => x.id === d.id)?.content ?? '';
      if (d.id === 'depot_legal' || d.id === 'rc_declaration') {
        const res = await createDocument({
          type: 'juridique',
          title: d.name,
          content: { kind: 'word_generated', template: d.id },
          metadata: {
            legalProcedure: d.id,
            legalProcedureLabel: d.name,
            generatedAt,
            companyName: c.raisonSociale,
            city: c.ville,
          },
          source: 'generated',
        });
        if (res.ok) persisted.set(d.id, res.id);
      } else if (textContent && textContent !== 'WORD_TABLE') {
        const saved = await persistLegalDocument({
          company: linkCompany as Company,
          procedureId: d.id,
          procedureLabel: d.name,
          content: textContent,
          formData: { ...f },
          linkSource: 'juridique_creation',
        });
        if (saved.ok) persisted.set(d.id, saved.id);
      }
    }
  };

  const handleDownload = async (doc: GeneratedDoc) => {
    const c = selectedCompany ?? standaloneCompany;
    if (!c.raisonSociale) return;
    if (doc.id === 'depot_legal') {
      await generateDepotLegalWord(c, formData, formData.gerant);
    } else if (doc.id === 'rc_declaration') {
      await generateRCWord(c, formData);
    } else {
      await generateWordDoc(doc.content, `${doc.id}_${c.raisonSociale.replace(/ /g, '_')}.docx`);
    }
  };

  const downloadAll = async () => {
    for (const doc of generatedDocs) {
      if (doc.status === 'done') {
        await handleDownload(doc);
        await new Promise(r => setTimeout(r, 600));
      }
    }
  };

  if (step === 'select') return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="font-bold text-gray-800">Dossier de Création</h2>
        <p className="text-xs text-gray-400 mt-0.5">Sélectionnez une société (optionnel) ou continuez en standalone</p>
      </div>
      <div className="px-4 py-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => { setSelectedCompany(null); setStep('form'); }}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
        >
          Continuer sans société (standalone)
        </button>
      </div>
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.map(c => (
          <button key={c.id} onClick={() => { setSelectedCompany(c); setStep('form'); }}
            className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#1B2A4A] rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">{c.raisonSociale.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{c.raisonSociale}</p>
                <p className="text-xs text-gray-400">{c.ville} · {c.formeJuridique}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Aucune société trouvée</div>}
      </div>
    </div>
  );

  if (step === 'form') return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center gap-3">
        <button onClick={() => setStep('select')} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={16} /></button>
        <div>
          <h2 className="font-bold text-gray-800">{selectedCompany?.raisonSociale ?? (standaloneCompany.raisonSociale || 'Standalone')}</h2>
          <p className="text-xs text-gray-400">Données de constitution (société optionnelle)</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {!selectedCompany && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-700 mb-3">Société (standalone)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1 block">Raison sociale *</label>
                <input value={standaloneCompany.raisonSociale} onChange={(e) => setStandaloneCompany({ ...standaloneCompany, raisonSociale: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Ville</label>
                <input value={standaloneCompany.ville} onChange={(e) => setStandaloneCompany({ ...standaloneCompany, ville: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Adresse</label>
                <input value={standaloneCompany.adresse} onChange={(e) => setStandaloneCompany({ ...standaloneCompany, adresse: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">IF</label>
                <input value={standaloneCompany.if_fiscal} onChange={(e) => setStandaloneCompany({ ...standaloneCompany, if_fiscal: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">ICE</label>
                <input value={standaloneCompany.ice} onChange={(e) => setStandaloneCompany({ ...standaloneCompany, ice: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">RC</label>
                <input value={standaloneCompany.rc} onChange={(e) => setStandaloneCompany({ ...standaloneCompany, rc: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">CNSS</label>
                <input value={standaloneCompany.cnss} onChange={(e) => setStandaloneCompany({ ...standaloneCompany, cnss: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
              </div>
            </div>
          </div>
        )}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs text-blue-600 font-medium mb-2">Documents Word générés automatiquement</p>
          <div className="flex flex-wrap gap-2">
            {docsToGenerate.map(d => (
              <span key={d.id} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded-lg">{d.name}</span>
            ))}
          </div>
        </div>
        {[
          { key: 'associes', label: 'Associés (nom, date naissance, ville, CIN, adresse, nb parts)', placeholder: 'Ex: Mohammed Alami né 01/01/1980 à Casa CIN AB123456 demeurant 10 Rue... - 50 parts', multi: true },
          { key: 'capital', label: 'Capital social (MAD)', placeholder: 'Ex: 100000' },
          { key: 'activite', label: 'Objet social / Activités', placeholder: 'Ex: Commerce général, conseil en gestion...' },
          { key: 'gerant', label: 'Nom complet du gérant', placeholder: 'Ex: Mohammed Alami' },
          { key: 'cin_gerant', label: 'CIN du gérant', placeholder: 'Ex: AB123456' },
          { key: 'adresse_gerant', label: 'Adresse personnelle du gérant', placeholder: 'Ex: 10 Rue Hassan II Casablanca' },
          { key: 'date_naissance_gerant', label: 'Date et lieu de naissance du gérant', placeholder: 'Ex: 01/01/1980 à Casablanca' },
          { key: 'date', label: "Date de l'acte", placeholder: 'JJ/MM/AAAA' },
        ].map(field => (
          <div key={field.key}>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">{field.label}</label>
            {field.multi ? (
              <textarea value={formData[field.key as keyof FormData]} onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder} rows={3} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none" />
            ) : (
              <input value={formData[field.key as keyof FormData]} onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400" />
            )}
          </div>
        ))}
        <button onClick={generateAll} className="w-full py-3 bg-[#1B2A4A] text-white rounded-xl font-semibold text-sm hover:bg-[#243660] transition-all flex items-center justify-center gap-2">
          <FileText size={16} /> Générer le dossier complet
        </button>
      </div>
    </div>
  );

  if (step === 'generating' || step === 'done') return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800">{selectedCompany?.raisonSociale}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{step === 'done' ? '✅ Dossier complet — 5 documents Word' : '⏳ Génération en cours...'}</p>
        </div>
        {step === 'done' && (
          <button onClick={() => { setStep('select'); setGeneratedDocs([]); }} className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
            <RefreshCw size={12} /> Nouveau
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {generatedDocs.map(doc => (
          <div key={doc.id} className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-xl shadow-sm">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${doc.status === 'done' ? 'bg-green-100' : doc.status === 'generating' ? 'bg-amber-100' : doc.status === 'error' ? 'bg-red-100' : 'bg-gray-100'}`}>
              {doc.status === 'done' ? <CheckCircle size={16} className="text-green-600" /> :
               doc.status === 'generating' ? <Loader2 size={16} className="text-amber-600 animate-spin" /> :
               <FileText size={16} className={doc.status === 'error' ? 'text-red-400' : 'text-gray-300'} />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">{doc.name}</p>
              <p className={`text-xs ${doc.status === 'done' ? 'text-green-500' : doc.status === 'generating' ? 'text-amber-500' : doc.status === 'error' ? 'text-red-400' : 'text-gray-300'}`}>
                {doc.status === 'done' ? 'Word ✓' : doc.status === 'generating' ? 'En cours...' : doc.status === 'error' ? 'Erreur' : 'En attente'}
              </p>
            </div>
            {doc.status === 'done' && (
              <button onClick={() => handleDownload(doc)} className="flex items-center gap-1 p-2 bg-[#1B2A4A] text-white rounded-lg hover:bg-[#243660] text-xs">
                <Download size={14} /> .docx
              </button>
            )}
          </div>
        ))}
        {step === 'done' && (
          <button onClick={downloadAll} className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-all flex items-center justify-center gap-2 mt-2">
            <Download size={16} /> Télécharger tout le dossier (5 Word)
          </button>
        )}

        {step === 'done' && companies.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-800">Lier à une société (optionnel)</p>
            <p className="text-xs text-gray-400 mt-0.5">Crée un lien flexible dans `atlas_links` (non requis).</p>
            <div className="mt-3 grid grid-cols-3 gap-3 items-end">
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1 block">Société</label>
                <select value={linkCompanyId} onChange={(e) => setLinkCompanyId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400">
                  <option value="">— Choisir —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.raisonSociale}</option>)}
                </select>
              </div>
              <button
                type="button"
                disabled={!linkCompanyId}
                onClick={async () => {
                  setLinkStatus('');
                  const res = await createAtlasLink({
                    fromType: 'juridique_generation',
                    fromId: generationId,
                    toType: 'company',
                    toId: String(linkCompanyId),
                    relation: 'attached_to',
                    metadata: { kind: 'creation_dossier' },
                  });
                  setLinkStatus(res.ok ? 'Lien créé.' : `Erreur: ${res.error}`);
                }}
                className="px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] disabled:opacity-40"
              >
                Lier
              </button>
              {linkStatus && <p className="col-span-3 text-xs text-gray-500">{linkStatus}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return null;
}

// ==================== MODIFICATIONS FORM ====================
type ModType = 'cession' | 'transfert' | 'dissolution' | 'augmentation' | null;

function ModificationsForm({ companies }: { companies: Company[] }) {
  const [modType, setModType] = useState<ModType>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [search, setSearch] = useState('');
  const [step, setStep] = useState<'select_type' | 'select_company' | 'form' | 'generating' | 'done'>('select_type');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [generatedContent, setGeneratedContent] = useState('');
  const [companyMode, setCompanyMode] = useState<'existing' | 'manual'>('existing');
  const [manualCompany, setManualCompany] = useState<Partial<Company>>({
    raisonSociale: '',
    ice: '',
    if_fiscal: '',
    cnss: '',
    adresse: '',
    ville: '',
    rc: '',
    formeJuridique: '',
  });
  const filtered = companies.filter(c => c.raisonSociale.toLowerCase().includes(search.toLowerCase()));

  const modTypes = [
    { id: 'cession', label: 'Cession de Parts', icon: '🔄', desc: 'Transfert de parts entre associés' },
    { id: 'transfert', label: 'Transfert Siège Social', icon: '📍', desc: 'Changement adresse siège' },
    { id: 'dissolution', label: 'Dissolution', icon: '🔚', desc: 'Décision de dissolution (liquidation → Formalités)' },
    { id: 'augmentation', label: 'Augmentation Capital', icon: '📈', desc: 'Augmentation du capital social' },
  ];

  const formFields: Record<string, { key: string; label: string; placeholder: string }[]> = {
    cession: [
      { key: 'cedant', label: 'Nom complet du cédant', placeholder: 'Mohammed Alami' },
      { key: 'date_naissance_cedant', label: 'Date de naissance cédant', placeholder: '17/02/1980' },
      { key: 'adresse_cedant', label: 'Adresse cédant', placeholder: 'Rue Hassan II Casablanca' },
      { key: 'cin_cedant', label: 'CIN cédant', placeholder: 'AB123456' },
      { key: 'cessionnaire', label: 'Nom complet du cessionnaire', placeholder: 'Ahmed Benali' },
      { key: 'date_naissance_cessionnaire', label: 'Date de naissance cessionnaire', placeholder: '29/07/2000' },
      { key: 'adresse_cessionnaire', label: 'Adresse cessionnaire', placeholder: 'Douar Charkaoua Settat' },
      { key: 'cin_cessionnaire', label: 'CIN cessionnaire', placeholder: 'CD789012' },
      { key: 'nombre_parts', label: 'Nombre de parts (chiffres + lettres)', placeholder: '100 (CENT)' },
      { key: 'prix', label: 'Prix cession MAD (chiffres + lettres)', placeholder: '10000 (DIX MILLE)' },
      { key: 'date', label: 'Date', placeholder: 'JJ/MM/AAAA' },
    ],
    transfert: [
      { key: 'ancien_siege', label: 'Ancien siège social', placeholder: 'Ancienne adresse complète' },
      { key: 'nouveau_siege', label: 'Nouveau siège social', placeholder: 'Nouvelle adresse complète' },
      { key: 'gerant', label: 'Nom du gérant', placeholder: 'Mohammed Alami' },
      { key: 'date', label: 'Date AGE', placeholder: 'JJ/MM/AAAA' },
    ],
    dissolution: [
      { key: 'motif', label: 'Motif de dissolution', placeholder: 'Cessation activité, accord unanime...' },
      { key: 'liquidateur', label: 'Nom du liquidateur', placeholder: 'Mohammed Alami' },
      { key: 'cin_liquidateur', label: 'CIN liquidateur', placeholder: 'AB123456' },
      { key: 'adresse_liquidateur', label: 'Adresse liquidateur', placeholder: 'Rue Hassan II Casablanca' },
      { key: 'date', label: 'Date AGE', placeholder: 'JJ/MM/AAAA' },
    ],
    augmentation: [
      { key: 'capital_actuel', label: 'Capital actuel (MAD)', placeholder: '100000' },
      { key: 'capital_nouveau', label: 'Nouveau capital (MAD)', placeholder: '200000' },
      { key: 'modalites', label: 'Modalités', placeholder: 'Apport en numéraire, incorporation réserves...' },
      { key: 'gerant', label: 'Nom du gérant', placeholder: 'Mohammed Alami' },
      { key: 'date', label: 'Date AGE', placeholder: 'JJ/MM/AAAA' },
    ],
  };

  const generateDoc = async () => {
    if (!selectedCompany || !modType) return;
    setStep('generating');
    const c = selectedCompany;
    const f = formData;
    const header = `"${c.raisonSociale}" / "SOCIETE A RESPONSABILITE LIMITEE AU CAPITAL DE [CAPITAL EN LETTRES] DIRHAMS" / "SIEGE SOCIAL: ${c.adresse} ${c.ville}" / "RC: ${c.rc}   ICE: ${c.ice}   IF: ${c.if_fiscal}"`;

    const prompts: Record<string, string> = {
      cession: `Expert juridique marocain. Genere CESSION DE PARTS SOCIALES officielle (6 exemplaires).
SOCIETE: ${c.raisonSociale} | RC: ${c.rc} | ICE: ${c.ice} | IF: ${c.if_fiscal} | Adresse: ${c.adresse} ${c.ville}
EN-TETE: ${header}
"CESSION DE PARTS SOCIALES"
"ENTRE-LES SOUSSIGNES:"
"${f.cedant} de nationalite marocaine, nee ${f.date_naissance_cedant}, demeurant a ${f.adresse_cedant}, CIN N° ${f.cin_cedant}."
"D'UNE PART"
"${f.cessionnaire}, de nationalite marocaine, nee ${f.date_naissance_cessionnaire}, demeurant ${f.adresse_cessionnaire}, CIN N° ${f.cin_cessionnaire}."
"D'AUTRE PART"
"IL EST EXPRESSEMENT CONVENU ET ARRETE CE QUI SUIT:"
"Cession de ${f.nombre_parts} parts."
"ETANT ICI PRECISE: RC ${c.rc} - capital divise en parts 100 DH liberees"
"ORIGINE DE PROPRIETE: parts acquises lors de la constitution"
"SUBROGATION: cessionnaire subroge dans tous droits"
"PROPRIETE ET JOUISSANCE: immediate + dividendes"
"PRIX DE VENTE: ${f.prix} DIRHAMS paye comptant."
"DONT QUITTANCE"
"NANTISSEMENT-SAISIES: parts libres"
"FRAIS: a charge cessionnaire"
"ELECTION DOMICILE: ${c.adresse} ${c.ville}"
"CLAUSE PARTICULIERE: cessionnaire accepte statuts"
"FORMALITES-POUVOIRS: porteur original"
"FAIT A ${c.ville} EN SIX EXEMPLAIRES LE ${f.date}"
"LE CEDANT                    LE CESSIONNAIRE"
"${f.cedant}                    ${f.cessionnaire}"`,

      transfert: `Expert juridique marocain. Genere DECISION EXTRAORDINAIRE TRANSFERT SIEGE SOCIAL.
SOCIETE: ${c.raisonSociale} | RC: ${c.rc} | ICE: ${c.ice} | IF: ${c.if_fiscal}
EN-TETE: ${header.replace(c.adresse + ' ' + c.ville, f.ancien_siege)}
"DECISION EXTRAORDINAIRE DU GERANT EN DATE DU ${f.date}"
"${f.gerant}, Gerant de ${c.raisonSociale}..."
"ORDRE DU JOUR: Transfert siege - Modification statuts - Questions diverses"
"PREMIERE RESOLUTION: Transfert de ${f.ancien_siege} a ${f.nouveau_siege}. ADOPTEE A L'UNANIMITE"
"DEUXIEME RESOLUTION: ARTICLE 4 SIEGE SOCIAL: Le siege est fixe a ${f.nouveau_siege}. ADOPTEE A L'UNANIMITE"
"TROISIEME RESOLUTION: POUVOIRS porteur original. ADOPTEE A L'UNANIMITE"
"Fait a ${c.ville} le ${f.date}" / "Le Gerant: ${f.gerant}"`,

      dissolution: `Expert juridique marocain. Genere PV AGE DISSOLUTION ET LIQUIDATION.
SOCIETE: ${c.raisonSociale} | RC: ${c.rc} | ICE: ${c.ice} | IF: ${c.if_fiscal} | Adresse: ${c.adresse} ${c.ville}
EN-TETE: ${header}
"PV AGE DISSOLUTION ET MISE EN LIQUIDATION - ${f.date}"
"PREMIERE RESOLUTION: DISSOLUTION - motif: ${f.motif}. ADOPTEE A L'UNANIMITE"
"DEUXIEME RESOLUTION: LIQUIDATEUR: ${f.liquidateur} CIN ${f.cin_liquidateur} ${f.adresse_liquidateur}. ADOPTEE A L'UNANIMITE"
"TROISIEME RESOLUTION: POUVOIRS porteur original publication et radiation. ADOPTEE A L'UNANIMITE"
"Fait a ${c.ville} le ${f.date}" / signatures`,

      augmentation: `Expert juridique marocain. Genere PV AGE AUGMENTATION CAPITAL.
SOCIETE: ${c.raisonSociale} | RC: ${c.rc} | ICE: ${c.ice} | IF: ${c.if_fiscal} | Adresse: ${c.adresse} ${c.ville}
EN-TETE: ${header}
"PV AGE AUGMENTATION DU CAPITAL - ${f.date}"
"PREMIERE RESOLUTION: Augmentation de ${f.capital_actuel} a ${f.capital_nouveau} DH par ${f.modalites}. ADOPTEE A L'UNANIMITE"
"DEUXIEME RESOLUTION: ARTICLE 7 nouveau capital ${f.capital_nouveau} DH. ADOPTEE A L'UNANIMITE"
"TROISIEME RESOLUTION: POUVOIRS porteur original. ADOPTEE A L'UNANIMITE"
"Fait a ${c.ville} le ${f.date}" / "Le Gerant: ${f.gerant}"`,
    };

    try {
      const content = await callAI(prompts[modType]);
      setGeneratedContent(content);
      setStep('done');
      const procedureIdMap: Record<string, string> = {
        cession: 'cession_parts',
        transfert: 'transfert_siege',
        dissolution: 'dissolution',
        augmentation: 'augmentation_capital',
      };
      const procedureId = procedureIdMap[modType] ?? modType;
      await persistLegalDocument({
        company: c,
        procedureId,
        procedureLabel: modTypes.find((m) => m.id === modType)?.label ?? 'Modification juridique',
        content,
        formData: f,
        linkSource: 'juridique_modification',
      });
    } catch { setStep('form'); }
  };

  const downloadModWord = async () => {
    if (!selectedCompany) return;
    await generateWordDoc(generatedContent, `${modType}_${selectedCompany.raisonSociale.replace(/ /g, '_')}.docx`);
  };

  if (step === 'select_type') return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="font-bold text-gray-800">Modifications de société</h2>
        <p className="text-xs text-gray-400 mt-0.5">Raccourcis — formalités courantes</p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
          Réduction de capital, radiation, mise en sommeil, transformation… : onglet <strong>Formalités juridiques</strong>.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {modTypes.map(m => (
          <button key={m.id} onClick={() => { setModType(m.id as ModType); setSelectedCompany(null); setCompanyMode('existing'); setStep('select_company'); }}
            className="w-full text-left p-4 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all bg-white">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{m.icon}</span>
              <div><p className="font-semibold text-gray-800 text-sm">{m.label}</p><p className="text-xs text-gray-400">{m.desc}</p></div>
              <ChevronRight size={14} className="text-gray-300 ml-auto" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  if (step === 'select_company') return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center gap-3">
        <button onClick={() => setStep('select_type')} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={16} /></button>
        <div>
          <h2 className="font-bold text-gray-800">{modTypes.find(m => m.id === modType)?.label}</h2>
          <p className="text-xs text-gray-400">Utiliser une société existante ou saisir manuellement</p>
        </div>
      </div>
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="inline-flex rounded-lg bg-white p-1 border border-gray-200">
          <button
            type="button"
            onClick={() => setCompanyMode('existing')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${companyMode === 'existing' ? 'bg-[#1B2A4A] text-white' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Utiliser une société
          </button>
          <button
            type="button"
            onClick={() => setCompanyMode('manual')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${companyMode === 'manual' ? 'bg-[#1B2A4A] text-white' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Saisie manuelle
          </button>
        </div>
      </div>

      {companyMode === 'existing' ? (
        <>
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filtered.map(c => (
              <button key={c.id} onClick={() => { setSelectedCompany(c); setStep('form'); }}
                className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#1B2A4A] rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">{c.raisonSociale.charAt(0)}</div>
                  <div className="flex-1 min-w-0"><p className="font-semibold text-gray-800 text-sm truncate">{c.raisonSociale}</p><p className="text-xs text-gray-400">{c.ville} · {c.formeJuridique}</p></div>
                  <ChevronRight size={14} className="text-gray-300" />
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-10 text-sm text-gray-400">
                Aucune société trouvée. Vous pouvez utiliser la saisie manuelle.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-800">Société (manuel)</p>
            <p className="text-xs text-gray-500 mt-0.5">Ces champs sont optionnels, mais le nom de la société est recommandé pour générer les documents.</p>
          </div>

          {[
            { key: 'raisonSociale', label: 'Nom de la société', placeholder: 'Ex: Cabinet XYZ SARL' },
            { key: 'formeJuridique', label: 'Forme juridique', placeholder: 'Ex: SARL' },
            { key: 'adresse', label: 'Adresse', placeholder: 'Ex: 10 Rue ...' },
            { key: 'ville', label: 'Ville', placeholder: 'Ex: Casablanca' },
            { key: 'rc', label: 'RC', placeholder: 'Ex: 12345' },
            { key: 'ice', label: 'ICE', placeholder: 'Ex: 001234567890123' },
            { key: 'if_fiscal', label: 'IF', placeholder: 'Ex: 1234567' },
            { key: 'cnss', label: 'CNSS', placeholder: 'Ex: 1234567' },
          ].map((f) => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">{f.label}</label>
              <input
                value={String(manualCompany[f.key as keyof Company] ?? '')}
                onChange={(e) => setManualCompany((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              const name = String(manualCompany.raisonSociale ?? '').trim();
              if (!name) {
                // keep UX friendly: require only the minimum needed for legal docs
                return;
              }
              const c: Company = {
                id: -Date.now(),
                raisonSociale: name,
                formeJuridique: String(manualCompany.formeJuridique ?? '').trim(),
                if_fiscal: String(manualCompany.if_fiscal ?? '').trim(),
                ice: String(manualCompany.ice ?? '').trim(),
                rc: String(manualCompany.rc ?? '').trim(),
                cnss: String(manualCompany.cnss ?? '').trim(),
                adresse: String(manualCompany.adresse ?? '').trim(),
                ville: String(manualCompany.ville ?? '').trim(),
                telephone: '',
                email: '',
                activite: '',
                regimeTVA: '',
                actif: false,
              };
              setSelectedCompany(c);
              setStep('form');
            }}
            className="w-full py-3 bg-[#1B2A4A] text-white rounded-xl font-semibold text-sm hover:bg-[#243660] transition-all"
          >
            Continuer
          </button>
          {!String(manualCompany.raisonSociale ?? '').trim() && (
            <p className="text-xs text-red-600">Le nom de la société est requis pour continuer.</p>
          )}
        </div>
      )}
    </div>
  );

  if (step === 'form') return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center gap-3">
        <button onClick={() => setStep('select_company')} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={16} /></button>
        <div><h2 className="font-bold text-gray-800">{selectedCompany?.raisonSociale}</h2><p className="text-xs text-gray-400">{modTypes.find(m => m.id === modType)?.label}</p></div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {(formFields[modType!] || []).map(field => (
          <div key={field.key}>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">{field.label}</label>
            <input value={formData[field.key] || ''} onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400" />
          </div>
        ))}
        <button onClick={generateDoc} className="w-full py-3 bg-[#1B2A4A] text-white rounded-xl font-semibold text-sm hover:bg-[#243660] transition-all flex items-center justify-center gap-2">
          <FileText size={16} /> Générer le document
        </button>
      </div>
    </div>
  );

  if (step === 'generating') return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={40} className="text-[#1B2A4A] animate-spin mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Génération en cours...</p>
        <p className="text-gray-400 text-sm mt-1">{selectedCompany?.raisonSociale}</p>
      </div>
    </div>
  );

  if (step === 'done') return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800">✅ Document généré</h2>
          <p className="text-xs text-gray-400">{selectedCompany?.raisonSociale} · {modTypes.find(m => m.id === modType)?.label}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadModWord} className="flex items-center gap-1 px-3 py-2 bg-[#1B2A4A] text-white rounded-lg text-xs hover:bg-[#243660]">
            <Download size={13} /> Word
          </button>
          <button onClick={() => { setStep('select_type'); setModType(null); setFormData({}); setGeneratedContent(''); }}
            className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
            <RefreshCw size={13} /> Nouveau
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
          {cleanText(generatedContent)}
        </div>
      </div>
    </div>
  );
  return null;
}

// ==================== MAIN PAGE ====================
export default function JuridiquePage() {
  const [activeTab, setActiveTab] = useState<JuridiqueTabId>('creation');
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    void (async () => {
      if (isAtlasSupabaseDataEnabled()) {
        const list = await listAtlasCompanies();
        setCompanies(list as Company[]);
        return;
      }
      const saved = localStorage.getItem('atlas_companies');
      if (saved) setCompanies(JSON.parse(saved));
    })();
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar
        variant="module"
        footer={
          <div className="px-4 py-3 border-t border-white/10">
            <div className="bg-white/5 rounded-lg p-2">
              <p className="text-white/30 text-xs">Mode automatique</p>
              <p className="text-white/50 text-xs mt-0.5">Remplissez une fois → 5 docs Word</p>
            </div>
          </div>
        }
      >
        <JuridiqueModuleTabs activeTab={activeTab} onChange={setActiveTab} variant="sidebar" />
      </AppSidebar>
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="shrink-0 border-b border-gray-200 bg-white">
          <div className="px-6 pt-4 pb-2 space-y-2">
            <BetaSurfaceBadge label="Bêta · Juridique & IA · Documents à valider par juriste/expert" />
          </div>
          <JuridiqueModuleTabs activeTab={activeTab} onChange={setActiveTab} variant="main" />
        </div>
        <div className="flex-1 flex overflow-hidden min-h-0">
        {activeTab === 'creation' ? (
          <CreationForm companies={companies} />
        ) : activeTab === 'modifications' ? (
          <ModificationsForm companies={companies} />
        ) : activeTab === 'formalites' ? (
          <JuridiqueFormalitesPanel companies={companies} />
        ) : activeTab === 'historique' ? (
          <div className="p-4 lg:p-6">
            <EntityAuditTable entityType="legal_document" title="Historique — Contrats et documents juridiques" />
          </div>
        ) : activeTab === 'pv' ? (
          <JuridiquePvGeneratorPanel companies={companies} />
        ) : activeTab === 'vault' ? (
          <CorporateVaultPanel />
        ) : (
          <JuridiqueDocumentsPanel companies={companies} />
        )}
        </div>
      </main>
    </div>
  );
}

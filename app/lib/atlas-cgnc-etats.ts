/**
 * Compilateur des états de synthèse CGNC (Modèle Normal / Simplifié)
 * et du tableau de passage CGI (résultat comptable → résultat fiscal → IS / CM).
 *
 * Plan comptable de référence : PCGE Maroc (classes 1–7), avec repli PCG français
 * pour les journaux mixtes (411, 401, 512, 60–69).
 */

import type {
  CgncAccountBalance,
  CgncBilan,
  CgncBilanLine,
  CgncBilanMasse,
  CgncBilanSide,
  CgncCompileOptions,
  CgncConsistencyCheck,
  CgncCpc,
  CgncCpcLine,
  CgncEtatsCompilation,
  CgncImpotSocietes,
  CgncJournalLine,
  CgncPassageLine,
  CgncTableauPassage,
} from '@/app/types/atlas-cgnc-etats';
import {
  calculateEstimatedIS,
  calculateMinimalISContribution,
  IS_FORMULA_VERSION,
  isRateLabel,
} from '@/app/lib/atlas-payroll-calculations';

export const CGNC_BALANCE_TOLERANCE = 1;
/** CGI art. 144 — plancher de la cotisation minimale (MAD). */
export const CGI_CM_PLANCHER = 3_000;

export function roundCgnc(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function pcgeDigits(compte: string): string {
  return String(compte ?? '').replace(/\D/g, '');
}

function startsWithAny(compte: string, prefixes: string[]): boolean {
  const d = pcgeDigits(compte);
  return prefixes.some((p) => d.startsWith(p));
}

type MassId =
  | 'actif_immobilise'
  | 'actif_circulant'
  | 'tresorerie_actif'
  | 'financement_permanent'
  | 'passif_circulant'
  | 'tresorerie_passif'
  | 'charges'
  | 'produits'
  | 'amortissements'
  | 'provisions_immo'
  | 'provisions_ac'
  | 'ignore';

/** Classification PCGE (+ repli PCG FR) d'un numéro de compte. */
export function classifyPcgeAccount(compte: string): MassId {
  const d = pcgeDigits(compte);
  if (!d) return 'ignore';
  const c1 = d[0];
  const c2 = d.slice(0, 2);
  const c3 = d.slice(0, 3);

  if (c2 === '28') return 'amortissements';
  if (c2 === '29') return 'provisions_immo';
  if (c2 === '39') return 'provisions_ac';

  if (c3 === '401' || c3 === '403' || c3 === '404' || c3 === '408') return 'passif_circulant';
  if (c3 === '409') return 'actif_circulant';
  if (c3 === '411' || c3 === '416' || c3 === '418') return 'actif_circulant';
  if (c3 === '419') return 'passif_circulant';
  if (c3 === '421' || c3 === '422' || c3 === '424' || c3 === '425' || c3 === '427' || c3 === '428') {
    return 'passif_circulant';
  }
  if (c3 === '431' || c3 === '437' || c3 === '438') return 'passif_circulant';
  if (c3 === '445') {
    if (d.startsWith('4456') || d.startsWith('44566')) return 'actif_circulant';
    return 'passif_circulant';
  }
  if (c3 === '467' || c3 === '471') return 'actif_circulant';
  if (c3 === '512' || c3 === '514' || c3 === '516' || c3 === '511' || c3 === '517' || c3 === '531' || c2 === '53') {
    return 'tresorerie_actif';
  }
  if (c3 === '519' || c2 === '55' || c2 === '59') return 'tresorerie_passif';
  if (c3 === '161' || c3 === '162' || c3 === '163' || c3 === '164' || c3 === '165' || c3 === '168') {
    return 'financement_permanent';
  }

  if (c1 === '1') return 'financement_permanent';
  if (c1 === '2') return 'actif_immobilise';
  if (c1 === '3') return 'actif_circulant';
  if (c1 === '4') return 'passif_circulant';
  if (c1 === '5') {
    if (c2 === '55' || c2 === '59') return 'tresorerie_passif';
    return 'tresorerie_actif';
  }
  if (c1 === '6') return 'charges';
  if (c1 === '7') return 'produits';
  return 'ignore';
}

type CpcNature = 'exploitation' | 'financier' | 'non_courant' | 'impot';

/** Nature CPC : exploitation / financier / non courant / impôt (PCGE, repli PCG FR). */
export function classifyCpcAccount(compte: string): CpcNature {
  const d = pcgeDigits(compte);
  const c1 = d[0];
  const c2 = d.slice(0, 2);

  if (c2 === '69') return 'impot';
  if (c2 === '67' && c1 === '6') return 'impot';
  if (c2 === '66') return 'financier';
  if (c2 === '63' && c1 === '6') return 'financier';
  if (c2 === '73') return 'financier';
  if (c2 === '65' && c1 === '6') return 'non_courant';
  if (c2 === '75') return 'non_courant';
  if (c1 === '6') return 'exploitation';
  if (c1 === '7') return 'exploitation';
  return 'exploitation';
}

export function aggregateBalances(lines: CgncJournalLine[]): {
  balances: CgncAccountBalance[];
  totalDebit: number;
  totalCredit: number;
} {
  const map = new Map<string, CgncAccountBalance>();
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const compte = pcgeDigits(line.compte) || String(line.compte ?? '').trim();
    if (!compte) continue;
    const debit = roundCgnc(line.debit ?? 0);
    const credit = roundCgnc(line.credit ?? 0);
    totalDebit = roundCgnc(totalDebit + debit);
    totalCredit = roundCgnc(totalCredit + credit);
    const prev = map.get(compte) ?? {
      compte,
      libelle: String(line.libelle ?? ''),
      debit: 0,
      credit: 0,
      solde: 0,
    };
    prev.debit = roundCgnc(prev.debit + debit);
    prev.credit = roundCgnc(prev.credit + credit);
    prev.solde = roundCgnc(prev.debit - prev.credit);
    if (!prev.libelle && line.libelle) prev.libelle = line.libelle;
    map.set(compte, prev);
  }

  const balances = [...map.values()].sort((a, b) => a.compte.localeCompare(b.compte));
  return { balances, totalDebit, totalCredit };
}

function debitNature(balances: CgncAccountBalance[], pred: (b: CgncAccountBalance) => boolean): number {
  return roundCgnc(balances.filter(pred).reduce((s, b) => s + Math.max(0, b.solde), 0));
}

function creditNature(balances: CgncAccountBalance[], pred: (b: CgncAccountBalance) => boolean): number {
  return roundCgnc(balances.filter(pred).reduce((s, b) => s + Math.max(0, -b.solde), 0));
}

function isCompte(b: CgncAccountBalance, prefixes: string[]): boolean {
  return startsWithAny(b.compte, prefixes);
}

function line(code: string, label: string, brut: number, amortProv = 0): CgncBilanLine {
  const b = roundCgnc(brut);
  const a = roundCgnc(amortProv);
  return { code, label, brut: b, amortProv: a, net: roundCgnc(b - a) };
}

function mass(code: CgncBilanMasse['code'], label: string, lines: CgncBilanLine[]): CgncBilanMasse {
  return {
    code,
    label,
    lines,
    totalBrut: roundCgnc(lines.reduce((s, l) => s + l.brut, 0)),
    totalAmortProv: roundCgnc(lines.reduce((s, l) => s + l.amortProv, 0)),
    totalNet: roundCgnc(lines.reduce((s, l) => s + l.net, 0)),
  };
}

function side(masses: CgncBilanMasse[]): CgncBilanSide {
  return {
    masses,
    totalBrut: roundCgnc(masses.reduce((s, m) => s + m.totalBrut, 0)),
    totalAmortProv: roundCgnc(masses.reduce((s, m) => s + m.totalAmortProv, 0)),
    totalNet: roundCgnc(masses.reduce((s, m) => s + m.totalNet, 0)),
  };
}

function cpcLine(code: string, label: string, montant: number): CgncCpcLine {
  return { code, label, montant: roundCgnc(montant) };
}

function compactLines(lines: CgncCpcLine[]): CgncCpcLine[] {
  return lines.filter((l) => Math.abs(l.montant) > 0.004);
}

function compactBilanLines(lines: CgncBilanLine[]): CgncBilanLine[] {
  return lines.filter((l) => Math.abs(l.brut) > 0.004 || Math.abs(l.amortProv) > 0.004 || Math.abs(l.net) > 0.004);
}

function buildCpc(balances: CgncAccountBalance[], modele: 'normal' | 'simplifie'): CgncCpc {
  const charges = balances.filter((b) => classifyPcgeAccount(b.compte) === 'charges');
  const produits = balances.filter((b) => classifyPcgeAccount(b.compte) === 'produits');

  const sumCharges = (prefixes: string[]) =>
    debitNature(charges, (b) => isCompte(b, prefixes) && classifyCpcAccount(b.compte) !== 'impot');
  const sumProduits = (prefixes: string[]) => creditNature(produits, (b) => isCompte(b, prefixes));

  const pe: CgncCpcLine[] = [
    cpcLine('711', 'Ventes de marchandises', sumProduits(['711', '707'])),
    cpcLine('712', 'Ventes de biens et services produits', sumProduits(['712', '701', '702', '703', '704', '705', '706', '708'])),
    cpcLine('713', 'Variation des stocks de produits', sumProduits(['713', '713']) - sumCharges(['713'])),
    cpcLine('714', 'Immobilisations produites par l\'entreprise pour elle-même', sumProduits(['714', '72'])),
    cpcLine('716', 'Subventions d\'exploitation', sumProduits(['716', '74'])),
    cpcLine('718', 'Autres produits d\'exploitation', creditNature(produits, (b) => classifyCpcAccount(b.compte) === 'exploitation' && !startsWithAny(b.compte, ['711', '712', '713', '714', '716', '719', '701', '702', '703', '704', '705', '706', '707', '708', '74', '72', '78']))),
    cpcLine('719', 'Reprises d\'exploitation ; transferts de charges', sumProduits(['719', '78'])),
  ];

  const ce: CgncCpcLine[] = [
    cpcLine('611', 'Achats revendus de marchandises', sumCharges(['611', '607'])),
    cpcLine('612', 'Achats consommés de matières et fournitures', sumCharges(['612', '601', '602', '603', '604', '605', '606', '608', '609'])),
    cpcLine('613', 'Autres charges externes', 0),
    cpcLine('617', 'Charges de personnel', sumCharges(['617', '64'])),
    cpcLine('618', 'Autres charges d\'exploitation', sumCharges(['618'])),
    cpcLine('619', 'Dotations d\'exploitation', sumCharges(['619', '68'])),
  ];

  const namedCharge = ['611', '612', '617', '618', '619', '63', '65', '66', '67', '69'];
  const otherExt = debitNature(charges, (b) => {
    if (classifyCpcAccount(b.compte) !== 'exploitation') return false;
    return !startsWithAny(b.compte, namedCharge);
  });
  const idx613 = ce.findIndex((l) => l.code === '613');
  if (idx613 >= 0) ce[idx613] = cpcLine('613', 'Autres charges externes', otherExt);

  const pf = [
    cpcLine('732', 'Produits des titres de participation et autres titres immobilisés', sumProduits(['732', '761'])),
    cpcLine('733', 'Gains de change', sumProduits(['733', '766'])),
    cpcLine('738', 'Intérêts et autres produits financiers', creditNature(produits, (b) => classifyCpcAccount(b.compte) === 'financier' && !startsWithAny(b.compte, ['732', '733']))),
  ];
  const cf = [
    cpcLine('631', 'Charges d\'intérêts', sumCharges(['631', '661'])),
    cpcLine('633', 'Pertes de change', sumCharges(['633', '666'])),
    cpcLine('638', 'Autres charges financières', debitNature(charges, (b) => classifyCpcAccount(b.compte) === 'financier' && !startsWithAny(b.compte, ['631', '633']))),
  ];
  const pnc = [
    cpcLine('751', 'Produits des cessions d\'immobilisations', sumProduits(['751', '775'])),
    cpcLine('758', 'Autres produits non courants', creditNature(produits, (b) => classifyCpcAccount(b.compte) === 'non_courant' && !startsWithAny(b.compte, ['751']))),
  ];
  const cnc = [
    cpcLine('651', 'Valeurs nettes d\'amortissements des immobilisations cédées', sumCharges(['651', '675'])),
    cpcLine('658', 'Autres charges non courantes', debitNature(charges, (b) => classifyCpcAccount(b.compte) === 'non_courant' && !startsWithAny(b.compte, ['651']))),
  ];

  const totalPE = roundCgnc(pe.reduce((s, l) => s + l.montant, 0));
  const totalCE = roundCgnc(ce.reduce((s, l) => s + l.montant, 0));
  const resultatExploitation = roundCgnc(totalPE - totalCE);
  const totalPF = roundCgnc(pf.reduce((s, l) => s + l.montant, 0));
  const totalCF = roundCgnc(cf.reduce((s, l) => s + l.montant, 0));
  const resultatFinancier = roundCgnc(totalPF - totalCF);
  const resultatCourant = roundCgnc(resultatExploitation + resultatFinancier);
  const totalPNC = roundCgnc(pnc.reduce((s, l) => s + l.montant, 0));
  const totalCNC = roundCgnc(cnc.reduce((s, l) => s + l.montant, 0));
  const resultatNonCourant = roundCgnc(totalPNC - totalCNC);
  const resultatAvantImpots = roundCgnc(resultatCourant + resultatNonCourant);
  const impotsSurLesResultats = debitNature(charges, (b) => classifyCpcAccount(b.compte) === 'impot');
  const resultatNet = roundCgnc(resultatAvantImpots - impotsSurLesResultats);

  const filter = modele === 'simplifie';
  return {
    modele,
    produitsExploitation: filter ? compactLines(pe) : pe,
    totalProduitsExploitation: totalPE,
    chargesExploitation: filter ? compactLines(ce) : ce,
    totalChargesExploitation: totalCE,
    resultatExploitation,
    produitsFinanciers: filter ? compactLines(pf) : pf,
    totalProduitsFinanciers: totalPF,
    chargesFinancieres: filter ? compactLines(cf) : cf,
    totalChargesFinancieres: totalCF,
    resultatFinancier,
    resultatCourant,
    produitsNonCourants: filter ? compactLines(pnc) : pnc,
    totalProduitsNonCourants: totalPNC,
    chargesNonCourantes: filter ? compactLines(cnc) : cnc,
    totalChargesNonCourantes: totalCNC,
    resultatNonCourant,
    resultatAvantImpots,
    impotsSurLesResultats,
    resultatNet,
  };
}

function tresorerieSplit(balances: CgncAccountBalance[]): { actif: number; passif: number } {
  let actif = 0;
  let passif = 0;
  for (const b of balances) {
    const mass = classifyPcgeAccount(b.compte);
    if (mass === 'tresorerie_actif') {
      if (b.solde >= 0) actif = roundCgnc(actif + b.solde);
      else passif = roundCgnc(passif + -b.solde);
    } else if (mass === 'tresorerie_passif') {
      if (b.solde <= 0) passif = roundCgnc(passif + -b.solde);
      else actif = roundCgnc(actif + b.solde);
    }
  }
  return { actif, passif };
}

function buildBilan(
  balances: CgncAccountBalance[],
  resultatNet: number,
  modele: 'normal' | 'simplifie',
): CgncBilan {
  const amortImmo = creditNature(balances, (b) => classifyPcgeAccount(b.compte) === 'amortissements');
  const provImmo = creditNature(balances, (b) => classifyPcgeAccount(b.compte) === 'provisions_immo');
  const provAc = creditNature(balances, (b) => classifyPcgeAccount(b.compte) === 'provisions_ac');

  const nonValeurs = debitNature(balances, (b) => isCompte(b, ['21']) && classifyPcgeAccount(b.compte) === 'actif_immobilise');
  const incorp = debitNature(balances, (b) => isCompte(b, ['22']) && classifyPcgeAccount(b.compte) === 'actif_immobilise');
  const corp = debitNature(balances, (b) => isCompte(b, ['23']) && classifyPcgeAccount(b.compte) === 'actif_immobilise');
  const fin = debitNature(balances, (b) => isCompte(b, ['24', '25', '26']) && classifyPcgeAccount(b.compte) === 'actif_immobilise');
  const ecaImmo = debitNature(balances, (b) => isCompte(b, ['27']) && classifyPcgeAccount(b.compte) === 'actif_immobilise');
  const otherImmo = debitNature(balances, (b) => {
    return classifyPcgeAccount(b.compte) === 'actif_immobilise' && !startsWithAny(b.compte, ['21', '22', '23', '24', '25', '26', '27']);
  });

  const stocks = debitNature(balances, (b) => classifyPcgeAccount(b.compte) === 'actif_circulant' && startsWithAny(b.compte, ['31', '32', '33']));
  const creances = debitNature(balances, (b) => {
    if (classifyPcgeAccount(b.compte) !== 'actif_circulant') return false;
    return startsWithAny(b.compte, ['34', '345', '409', '411', '416', '418', '467', '471']);
  });
  const tvp = debitNature(balances, (b) => classifyPcgeAccount(b.compte) === 'actif_circulant' && startsWithAny(b.compte, ['35']));
  const otherAc = debitNature(balances, (b) => {
    if (classifyPcgeAccount(b.compte) !== 'actif_circulant') return false;
    return !startsWithAny(b.compte, ['31', '32', '33', '34', '35', '345', '409', '411', '416', '418', '467', '471']);
  });

  const { actif: tresoActif, passif: tresoPassif } = tresorerieSplit(balances);

  const amortOnCorp = amortImmo;
  const immoLinesNormal: CgncBilanLine[] = [
    line('211', 'Immobilisations en non-valeurs', nonValeurs),
    line('22', 'Immobilisations incorporelles', incorp),
    line('23', 'Immobilisations corporelles', corp + otherImmo, amortOnCorp),
    line('24', 'Immobilisations financières', fin),
    line('27', 'Écarts de conversion — Actif', ecaImmo),
  ];
  const acLinesNormal: CgncBilanLine[] = [
    line('31', 'Stocks', stocks),
    line('34', 'Créances de l\'actif circulant', creances + otherAc, provAc),
    line('35', 'Titres et valeurs de placement', tvp),
  ];
  const taLines: CgncBilanLine[] = [
    line('51', 'Trésorerie — Actif', tresoActif),
  ];

  const immoLinesSimple: CgncBilanLine[] = [
    line('2', 'Actif immobilisé', nonValeurs + incorp + corp + fin + ecaImmo + otherImmo, amortOnCorp + provImmo),
  ];
  const acLinesSimple: CgncBilanLine[] = [
    line('3', 'Actif circulant (hors trésorerie)', stocks + creances + tvp + otherAc, provAc),
  ];

  const actifMasses: CgncBilanMasse[] = modele === 'normal'
    ? [
        mass('I', 'ACTIF IMMOBILISÉ', compactBilanLines(immoLinesNormal)),
        mass('II', 'ACTIF CIRCULANT (HORS TRÉSORERIE)', compactBilanLines(acLinesNormal)),
        mass('III', 'TRÉSORERIE — ACTIF', compactBilanLines(taLines)),
      ]
    : [
        mass('I', 'ACTIF IMMOBILISÉ', compactBilanLines(immoLinesSimple)),
        mass('II', 'ACTIF CIRCULANT (HORS TRÉSORERIE)', compactBilanLines(acLinesSimple)),
        mass('III', 'TRÉSORERIE — ACTIF', compactBilanLines(taLines)),
      ];

  const capPropres = creditNature(balances, (b) => classifyPcgeAccount(b.compte) === 'financement_permanent' && startsWithAny(b.compte, ['10', '11', '12']));
  const compte13 = creditNature(balances, (b) => startsWithAny(b.compte, ['13'])) - debitNature(balances, (b) => startsWithAny(b.compte, ['13']));
  const assimiles = creditNature(balances, (b) => startsWithAny(b.compte, ['14']));
  const provisionsDurables = creditNature(balances, (b) => startsWithAny(b.compte, ['15']));
  const dettesFin = creditNature(balances, (b) => classifyPcgeAccount(b.compte) === 'financement_permanent' && startsWithAny(b.compte, ['16']));
  const ecpPermanent = creditNature(balances, (b) => startsWithAny(b.compte, ['17']));
  const otherFp = creditNature(balances, (b) => {
    if (classifyPcgeAccount(b.compte) !== 'financement_permanent') return false;
    return !startsWithAny(b.compte, ['10', '11', '12', '13', '14', '15', '16', '17']);
  });

  const chargesOpen = debitNature(balances, (b) => classifyPcgeAccount(b.compte) === 'charges');
  const produitsOpen = creditNature(balances, (b) => classifyPcgeAccount(b.compte) === 'produits');
  const cpcStillOpen = chargesOpen + produitsOpen > CGNC_BALANCE_TOLERANCE;
  let resultatNetInclus = roundCgnc(compte13);
  let resultatNetInjecte = false;
  if (cpcStillOpen) {
    if (Math.abs(compte13 - resultatNet) <= CGNC_BALANCE_TOLERANCE) {
      resultatNetInclus = roundCgnc(compte13);
    } else if (Math.abs(compte13) <= CGNC_BALANCE_TOLERANCE) {
      resultatNetInclus = roundCgnc(resultatNet);
      resultatNetInjecte = true;
    } else {
      resultatNetInclus = roundCgnc(compte13 + resultatNet);
      resultatNetInjecte = true;
    }
  }

  const dettesPc = creditNature(balances, (b) => classifyPcgeAccount(b.compte) === 'passif_circulant' && !startsWithAny(b.compte, ['47', '15']));
  const ecpCirculant = creditNature(balances, (b) => startsWithAny(b.compte, ['47']));

  const fpLinesNormal: CgncBilanLine[] = [
    line('11', 'Capitaux propres', capPropres + otherFp),
    line('13', 'Résultat net de l\'exercice', resultatNetInclus),
    line('14', 'Capitaux propres assimilés', assimiles),
    line('15', 'Provisions durables pour risques et charges', provisionsDurables),
    line('16', 'Dettes de financement', dettesFin),
    line('17', 'Écarts de conversion — Passif', ecpPermanent),
  ];
  const pcLinesNormal: CgncBilanLine[] = [
    line('44', 'Dettes du passif circulant', dettesPc),
    line('47', 'Écarts de conversion — Passif (circulant)', ecpCirculant),
  ];
  const tpLines: CgncBilanLine[] = [
    line('55', 'Trésorerie — Passif', tresoPassif),
  ];
  const fpLinesSimple: CgncBilanLine[] = [
    line('1', 'Financement permanent', capPropres + otherFp + assimiles + provisionsDurables + dettesFin + ecpPermanent + resultatNetInclus),
  ];
  const pcLinesSimple: CgncBilanLine[] = [
    line('4', 'Passif circulant (hors trésorerie)', dettesPc + ecpCirculant),
  ];

  const passifMasses: CgncBilanMasse[] = modele === 'normal'
    ? [
        mass('I', 'FINANCEMENT PERMANENT', compactBilanLines(fpLinesNormal)),
        mass('II', 'PASSIF CIRCULANT (HORS TRÉSORERIE)', compactBilanLines(pcLinesNormal)),
        mass('III', 'TRÉSORERIE — PASSIF', compactBilanLines(tpLines)),
      ]
    : [
        mass('I', 'FINANCEMENT PERMANENT', compactBilanLines(fpLinesSimple)),
        mass('II', 'PASSIF CIRCULANT (HORS TRÉSORERIE)', compactBilanLines(pcLinesSimple)),
        mass('III', 'TRÉSORERIE — PASSIF', compactBilanLines(tpLines)),
      ];

  const actif = side(actifMasses);
  const passif = side(passifMasses);
  const ecart = roundCgnc(actif.totalNet - passif.totalNet);

  return {
    modele,
    actif,
    passif,
    resultatNetInclus,
    resultatNetInjecte,
    equilibre: Math.abs(ecart) <= CGNC_BALANCE_TOLERANCE,
    ecart,
  };
}

function buildPassage(
  balances: CgncAccountBalance[],
  resultatNet: number,
  options: CgncCompileOptions,
): CgncTableauPassage {
  const reintegrations: CgncPassageLine[] = [];
  const deductions: CgncPassageLine[] = [];

  const isComptable = debitNature(balances, (b) => classifyCpcAccount(b.compte) === 'impot');
  if (isComptable > 0) {
    reintegrations.push({
      code: 'R-67',
      label: 'Impôt sur les sociétés (non déductible)',
      montant: isComptable,
      cgiRef: 'CGI art. 11 / 19',
    });
  }

  const amendes = debitNature(balances, (b) => startsWithAny(b.compte, ['658', '6586', '6588', '671']));
  if (amendes > 0) {
    reintegrations.push({
      code: 'R-658',
      label: 'Amendes, pénalités et condamnations',
      montant: amendes,
      cgiRef: 'CGI art. 11',
    });
  }

  const dividends = creditNature(balances, (b) => startsWithAny(b.compte, ['732', '761']));
  if (dividends > 0) {
    deductions.push({
      code: 'D-732',
      label: 'Produits des titres de participation (régime mère-fille)',
      montant: dividends,
      cgiRef: 'CGI art. 6',
    });
  }

  const deficit = roundCgnc(Math.max(0, options.deficitReportable ?? 0));
  if (deficit > 0) {
    deductions.push({
      code: 'D-DEF',
      label: 'Déficit reportable antérieur',
      montant: deficit,
      cgiRef: 'CGI art. 12',
    });
  }

  for (const row of options.reintegrationsManuelles ?? []) {
    if (Math.abs(row.montant) > 0.004) reintegrations.push({ ...row, montant: roundCgnc(row.montant) });
  }
  for (const row of options.deductionsManuelles ?? []) {
    if (Math.abs(row.montant) > 0.004) deductions.push({ ...row, montant: roundCgnc(row.montant) });
  }

  const totalReintegrations = roundCgnc(reintegrations.reduce((s, r) => s + r.montant, 0));
  const totalDeductions = roundCgnc(deductions.reduce((s, r) => s + r.montant, 0));
  const resultatFiscal = roundCgnc(resultatNet + totalReintegrations - totalDeductions);

  return {
    resultatNetComptable: roundCgnc(resultatNet),
    reintegrations,
    totalReintegrations,
    deductions,
    totalDeductions,
    resultatFiscal,
  };
}

export function chiffreAffairesHT(balances: CgncAccountBalance[]): number {
  return creditNature(balances, (b) =>
    startsWithAny(b.compte, ['711', '712', '701', '702', '703', '704', '705', '706', '707', '708']),
  );
}

function buildImpot(passage: CgncTableauPassage, caHT: number, _fiscalYear: number): CgncImpotSocietes {
  const resultatFiscal = passage.resultatFiscal;
  const cotisationMinimale = calculateMinimalISContribution(caHT);
  const isCalcule = calculateEstimatedIS(resultatFiscal);
  const impotDu = roundCgnc(Math.max(isCalcule, cotisationMinimale));
  return {
    chiffreAffairesHT: roundCgnc(caHT),
    resultatFiscal,
    isCalcule,
    tauxApplique: isRateLabel(resultatFiscal),
    cotisationMinimale,
    cotisationMinimaleTaux: '0,50 % du CA HT (CGI art. 144)',
    cotisationMinimalePlancher: caHT > 0 ? CGI_CM_PLANCHER : 0,
    cotisationMinimaleAppliquee: cotisationMinimale > isCalcule,
    impotDu,
    formuleVersion: IS_FORMULA_VERSION,
  };
}

function buildConsistency(
  totalDebit: number,
  totalCredit: number,
  bilan: CgncBilan,
  cpc: CgncCpc,
  passage: CgncTableauPassage,
): CgncConsistencyCheck[] {
  const checks: CgncConsistencyCheck[] = [
    {
      id: 'journal-equilibre',
      ok: Math.abs(totalDebit - totalCredit) <= CGNC_BALANCE_TOLERANCE,
      message: 'Journal : total débit = total crédit',
      expected: totalDebit,
      actual: totalCredit,
    },
    {
      id: 'bilan-equilibre',
      ok: bilan.equilibre,
      message: 'Bilan CGNC : Total Actif = Total Passif',
      expected: bilan.actif.totalNet,
      actual: bilan.passif.totalNet,
    },
    {
      id: 'cpc-resultat-net',
      ok: true,
      message: 'CPC : RN = RE + RF + RNC − IS',
      expected: cpc.resultatNet,
      actual: roundCgnc(
        cpc.resultatExploitation + cpc.resultatFinancier + cpc.resultatNonCourant - cpc.impotsSurLesResultats,
      ),
    },
    {
      id: 'cpc-resultat-courant',
      ok: Math.abs(cpc.resultatCourant - (cpc.resultatExploitation + cpc.resultatFinancier)) <= CGNC_BALANCE_TOLERANCE,
      message: 'CPC : Résultat courant = RE + RF',
      expected: cpc.resultatCourant,
      actual: roundCgnc(cpc.resultatExploitation + cpc.resultatFinancier),
    },
    {
      id: 'passage-rf',
      ok: Math.abs(passage.resultatFiscal - (passage.resultatNetComptable + passage.totalReintegrations - passage.totalDeductions)) <= CGNC_BALANCE_TOLERANCE,
      message: 'Tableau de passage : RF = RN + réintégrations − déductions',
      expected: passage.resultatFiscal,
      actual: roundCgnc(passage.resultatNetComptable + passage.totalReintegrations - passage.totalDeductions),
    },
    {
      id: 'bilan-cpc-resultat',
      ok: Math.abs(bilan.resultatNetInclus - cpc.resultatNet) <= CGNC_BALANCE_TOLERANCE,
      message: 'Cohérence Bilan ↔ CPC : résultat net',
      expected: cpc.resultatNet,
      actual: bilan.resultatNetInclus,
    },
  ];
  const rnCheck = checks.find((c) => c.id === 'cpc-resultat-net');
  if (rnCheck) rnCheck.ok = Math.abs((rnCheck.expected ?? 0) - (rnCheck.actual ?? 0)) <= CGNC_BALANCE_TOLERANCE;
  return checks;
}

export function journalLinesFromUnknown(rows: unknown[]): CgncJournalLine[] {
  const lines: CgncJournalLine[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const entry = (r.entry_json && typeof r.entry_json === 'object' ? r.entry_json : r) as Record<string, unknown>;
    const compte = String(entry.compte ?? r.compte ?? '');
    if (!compte) continue;
    lines.push({
      compte,
      debit: Number(entry.debit ?? r.debit ?? 0) || 0,
      credit: Number(entry.credit ?? r.credit ?? 0) || 0,
      libelle: String(entry.libelle ?? r.libelle ?? ''),
    });
  }
  return lines;
}

export function compileCgncEtats(
  lines: CgncJournalLine[],
  options: CgncCompileOptions = {},
): CgncEtatsCompilation {
  const fiscalYear = options.fiscalYear ?? new Date().getFullYear();
  const { balances, totalDebit, totalCredit } = aggregateBalances(lines);
  const cpcNormal = buildCpc(balances, 'normal');
  const cpcSimplifie = { ...buildCpc(balances, 'simplifie'), modele: 'simplifie' as const };
  const bilanNormal = buildBilan(balances, cpcNormal.resultatNet, 'normal');
  const bilanSimplifie = buildBilan(balances, cpcNormal.resultatNet, 'simplifie');
  const tableauPassage = buildPassage(balances, cpcNormal.resultatNet, options);
  const impotSocietes = buildImpot(tableauPassage, chiffreAffairesHT(balances), fiscalYear);
  const consistency = buildConsistency(totalDebit, totalCredit, bilanNormal, cpcNormal, tableauPassage);

  return {
    fiscalYear,
    journalEquilibre: Math.abs(totalDebit - totalCredit) <= CGNC_BALANCE_TOLERANCE,
    totalDebit,
    totalCredit,
    balances,
    bilanNormal,
    bilanSimplifie,
    cpcNormal,
    cpcSimplifie,
    tableauPassage,
    impotSocietes,
    consistency,
  };
}

/** Payload liasse rétro-compatible (actif / passif / charges / produits) + états officiels. */
export function toLiasseEtatsPayload(etats: CgncEtatsCompilation): {
  bilan: Record<string, unknown>;
  cpc: Record<string, unknown>;
  tableau_passage: CgncTableauPassage;
  impot_societes: CgncImpotSocietes;
  etats_cgnc: CgncEtatsCompilation;
} {
  return {
    bilan: {
      modele: 'normal',
      actif: etats.bilanNormal.actif.totalNet,
      passif: etats.bilanNormal.passif.totalNet,
      total_debit: etats.totalDebit,
      total_credit: etats.totalCredit,
      equilibre: etats.bilanNormal.equilibre,
      ecart: etats.bilanNormal.ecart,
      financement_permanent: etats.bilanNormal.passif.masses[0]?.totalNet ?? 0,
      actif_immobilise: etats.bilanNormal.actif.masses[0]?.totalNet ?? 0,
      actif_circulant_hors_tresorerie: etats.bilanNormal.actif.masses[1]?.totalNet ?? 0,
      tresorerie_actif: etats.bilanNormal.actif.masses[2]?.totalNet ?? 0,
      passif_circulant: etats.bilanNormal.passif.masses[1]?.totalNet ?? 0,
      tresorerie_passif: etats.bilanNormal.passif.masses[2]?.totalNet ?? 0,
      resultat_net: etats.cpcNormal.resultatNet,
      normal: etats.bilanNormal,
      simplifie: etats.bilanSimplifie,
    },
    cpc: {
      charges: etats.cpcNormal.totalChargesExploitation
        + etats.cpcNormal.totalChargesFinancieres
        + etats.cpcNormal.totalChargesNonCourantes
        + etats.cpcNormal.impotsSurLesResultats,
      produits: etats.cpcNormal.totalProduitsExploitation
        + etats.cpcNormal.totalProduitsFinanciers
        + etats.cpcNormal.totalProduitsNonCourants,
      resultat_exploitation: etats.cpcNormal.resultatExploitation,
      resultat_financier: etats.cpcNormal.resultatFinancier,
      resultat_courant: etats.cpcNormal.resultatCourant,
      resultat_non_courant: etats.cpcNormal.resultatNonCourant,
      resultat_avant_impots: etats.cpcNormal.resultatAvantImpots,
      impots_sur_les_resultats: etats.cpcNormal.impotsSurLesResultats,
      resultat_net: etats.cpcNormal.resultatNet,
      normal: etats.cpcNormal,
      simplifie: etats.cpcSimplifie,
    },
    tableau_passage: etats.tableauPassage,
    impot_societes: etats.impotSocietes,
    etats_cgnc: etats,
  };
}

export function cgncEtatsFromAccountingRows(
  rows: unknown[],
  options: CgncCompileOptions = {},
): CgncEtatsCompilation {
  return compileCgncEtats(journalLinesFromUnknown(rows), options);
}

/** Fixture interne — journal PCGE équilibré pour tests de non-régression. */
export function cgncReferenceJournal(): CgncJournalLine[] {
  return [
    { compte: '111000', credit: 100_000, libelle: 'Capital social' },
    { compte: '514100', debit: 100_000, libelle: 'Banque — apport' },
    { compte: '342100', debit: 12_000, libelle: 'Client — vente' },
    { compte: '711000', credit: 10_000, libelle: 'Vente de marchandises' },
    { compte: '445500', credit: 2_000, libelle: 'TVA collectée' },
    { compte: '612000', debit: 5_000, libelle: 'Achats consommés' },
    { compte: '345510', debit: 1_000, libelle: 'TVA déductible' },
    { compte: '441000', credit: 6_000, libelle: 'Fournisseur' },
    { compte: '441000', debit: 6_000, libelle: 'Règlement fournisseur' },
    { compte: '514100', credit: 6_000, libelle: 'Banque — règlement' },
    { compte: '514100', debit: 12_000, libelle: 'Banque — encaissement' },
    { compte: '342100', credit: 12_000, libelle: 'Client — encaissement' },
    { compte: '658000', debit: 500, libelle: 'Amende fiscale' },
    { compte: '514100', credit: 500, libelle: 'Banque — amende' },
  ];
}

export function verifyCgncEtatsFixtures(): { ok: boolean; failures: string[] } {
  const etats = compileCgncEtats(cgncReferenceJournal(), { fiscalYear: 2026 });
  const failures: string[] = [];
  const expectEq = (label: string, a: number, b: number) => {
    if (Math.abs(a - b) > CGNC_BALANCE_TOLERANCE) failures.push(`${label}: ${a} ≠ ${b}`);
  };

  expectEq('journal D=C', etats.totalDebit, etats.totalCredit);
  expectEq('total actif', etats.bilanNormal.actif.totalNet, 106_500);
  expectEq('total passif', etats.bilanNormal.passif.totalNet, 106_500);
  expectEq('RE', etats.cpcNormal.resultatExploitation, 5_000);
  expectEq('RNC', etats.cpcNormal.resultatNonCourant, -500);
  expectEq('RN', etats.cpcNormal.resultatNet, 4_500);
  expectEq('réintégration amende', etats.tableauPassage.totalReintegrations, 500);
  expectEq('RF', etats.tableauPassage.resultatFiscal, 5_000);
  expectEq('IS 10%', etats.impotSocietes.isCalcule, 500);
  expectEq('CM plancher CGI', etats.impotSocietes.cotisationMinimale, 3_000);
  expectEq('IS dû = max(IS, CM)', etats.impotSocietes.impotDu, 3_000);
  if (!etats.bilanNormal.equilibre) failures.push('bilan non équilibré');
  if (!etats.consistency.every((c) => c.ok)) {
    failures.push(`contrôles: ${etats.consistency.filter((c) => !c.ok).map((c) => c.id).join(', ')}`);
  }

  const broken = compileCgncEtats([
    { compte: '111000', credit: 50_000 },
    { compte: '21', debit: 10_000 },
    { compte: '31', debit: 5_000 },
    { compte: '3', debit: 1_000 },
  ]);
  if (broken.bilanNormal.equilibre) failures.push('un journal déséquilibré ne doit pas produire un bilan OK');

  return { ok: failures.length === 0, failures };
}

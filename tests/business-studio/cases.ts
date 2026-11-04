/**
 * Realistic Moroccan business cases used by the tests and the document checks. Company identifiers are fictitious;
 * amounts are plausible orders of magnitude chosen for the test, not market statistics.
 */
import {
  emptyModel, newExpense, newInvestment, newLoan, newProduct, newRisk, newStaff, type StudyModel,
} from '../../app/lib/business-studio/model';

/** Bakery-pastry shop created in Marrakech: SARL, bank loan with grace period, equipment grant. */
export function bakeryCase(years = 7, startMonth = '2027-01'): StudyModel {
  const m = emptyModel({ startMonth, years, sector: 'retail', projectType: 'creation' });
  m.profile.company = {
    ...m.profile.company, name: 'Boulangerie Al Baraka SARL', tradingName: 'Al Baraka', legalForm: 'sarl', city: 'Marrakech',
    address: 'Avenue Mohammed VI, Guéliz', activity: 'Boulangerie, pâtisserie et viennoiserie', incorporated: true,
    ice: '001234567000089', rc: '123456', if: '45678901', cnss: '9876543',
  };
  m.profile.directors = [
    { id: 'd1', name: 'Youssef El Amrani', position: 'Gérant', history: 'Chef boulanger depuis 2012', qualifications: 'BTS boulangerie', experienceYears: 14 },
  ];
  m.profile.shareholders = [
    { id: 'a1', name: 'Youssef El Amrani', ownershipPct: 60, contribution: 240000, commitment: 'Gérance à plein temps' },
    { id: 'a2', name: 'Salma Bennani', ownershipPct: 40, contribution: 160000, commitment: 'Associée non gérante' },
  ];
  m.profile.project = {
    location: 'Guéliz, Marrakech', objectives: 'Ouvrir une boulangerie-pâtisserie de quartier avec fournil sur place.',
    description: 'Production quotidienne de pain, viennoiseries et pâtisseries ; commandes pour événements.',
    businessModel: 'Vente au comptant en boutique et commandes professionnelles à 30 jours.', market: 'Quartier résidentiel et bureaux.',
    targetCustomers: 'Ménages, cafés et hôtels du quartier.', competition: 'Deux boulangeries à moins de 500 m.',
  };
  m.general.inflationPct = 2;
  m.general.discountRatePct = 11;
  m.products = [
    newProduct({ id: 'pain', name: 'Pain', unitPrice: 1.5, volumeMonth1: 30000, volumeGrowthPct: [8, 5, 3], unitCost: 0.55, vatRatePct: 0, purchaseVatRatePct: 0 }),
    newProduct({ id: 'vienn', name: 'Viennoiseries', unitPrice: 4, volumeMonth1: 12000, volumeGrowthPct: [10, 6, 4], unitCost: 1.6, vatRatePct: 20, purchaseVatRatePct: 20 }),
    newProduct({
      id: 'patis', name: 'Pâtisseries', unitPrice: 12, volumeMonth1: 4000, volumeGrowthPct: [12, 7, 4], unitCost: 4.5, vatRatePct: 20,
      seasonality: [0.9, 0.9, 1.3, 1.1, 1, 0.9, 1, 1, 0.9, 0.9, 1, 1.1],
    }),
    newProduct({ id: 'cmd', name: 'Commandes événements', unitPrice: 1800, volumeMonth1: 6, volumeGrowthPct: [15, 8], unitCost: 700, vatRatePct: 20, launchMonth: 3 }),
  ];
  m.expenses = [
    newExpense({ id: 'loyer', name: 'Loyer du local', category: 'rent', amountMonthly: 12000, vatRatePct: 0, vatDeductible: false, indexedOnInflation: false, growthPct: 3 }),
    newExpense({ id: 'elec', name: 'Électricité et gaz du fournil', category: 'utilities', amountMonthly: 9000, vatRatePct: 20 }),
    newExpense({ id: 'emb', name: 'Emballages', category: 'raw_materials', behavior: 'variable_revenue_pct', pctOfRevenue: 1.5, vatRatePct: 20 }),
    newExpense({ id: 'entretien', name: 'Entretien du matériel', category: 'maintenance', amountMonthly: 1500, vatRatePct: 20 }),
    newExpense({ id: 'assur', name: 'Assurance multirisque (taxe d’assurance incluse)', category: 'insurance', amountMonthly: 800, vatRatePct: 0 }),
    newExpense({ id: 'compta', name: 'Expert-comptable', category: 'fees', amountMonthly: 2500, vatRatePct: 20 }),
    newExpense({ id: 'tel', name: 'Téléphone et internet', category: 'telecom', amountMonthly: 500, vatRatePct: 20 }),
  ];
  m.staff = [
    newStaff({ id: 'gerant', role: 'Gérant', grossMonthly: 12000, dependants: 2, annualRaisePct: 3 }),
    newStaff({ id: 'boul', role: 'Boulangers', headcount: 3, grossMonthly: 4500, annualRaisePct: 3 }),
    newStaff({ id: 'patiss', role: 'Pâtissier', grossMonthly: 6000, annualRaisePct: 3 }),
    newStaff({ id: 'vend', role: 'Vendeuses', headcount: 2, grossMonthly: 3500, annualRaisePct: 3 }),
  ];
  m.investments = [
    newInvestment({ id: 'four', name: 'Four à sole et pétrin', amountHT: 420000, usefulLifeYears: 10 }),
    newInvestment({ id: 'froid', name: 'Chambre froide et vitrines', amountHT: 160000, usefulLifeYears: 7 }),
    newInvestment({ id: 'amgt', name: 'Aménagement du local', amountHT: 220000, usefulLifeYears: 10 }),
    newInvestment({ id: 'caisse', name: 'Caisse et logiciel', kind: 'intangible', amountHT: 18000, usefulLifeYears: 3, vatRefundEligible: false }),
    newInvestment({ id: 'caution', name: 'Dépôt de garantie', kind: 'deposit', amountHT: 36000, vatRatePct: 0 }),
  ];
  m.financing.equity = [{ id: 'capital', name: 'Capital social', amount: 400000, month: 0 }];
  m.financing.loans = [newLoan({ id: 'banque', name: 'Crédit d’investissement', principal: 550000, annualRatePct: 6.5, termMonths: 84, graceMonths: 6, feesPct: 1 })];
  m.financing.grants = [{ id: 'sub', name: 'Prime à l’équipement', kind: 'investment', amount: 50000, month: 4, amortizationYears: 10 }];
  m.financing.overdraftRatePct = 9;
  m.financing.dividends = { payoutPct: 30, fromFiscalYearIndex: 3, paymentMonthOfFiscalYear: 6, withholdingRatePct: 0, withholdingMode: 'legal' };
  m.tax.vatInvestmentRefund = true;
  m.workingCapital = { cashSalesPct: 85, dsoDays: 30, dpoDays: 30, inventoryDays: 7, badDebtPct: 0.5, minimumCash: 60000 };
  m.tax.localTaxes = [
    { id: 'tp', name: 'Taxe professionnelle', kind: 'tp', base: 'rental_value', ratePct: 10, amount: 0, baseAmount: 144000, startFiscalYearIndex: 1, exemptYears: 5, paymentMonthOfFiscalYear: 2, legalBasis: 'Saisie utilisateur — à confirmer auprès de la commune' },
    { id: 'tsc', name: 'Taxe de services communaux', kind: 'tsc', base: 'rental_value', ratePct: 10.5, amount: 0, baseAmount: 144000, startFiscalYearIndex: 1, exemptYears: 0, paymentMonthOfFiscalYear: 2, legalBasis: 'Saisie utilisateur — à confirmer auprès de la commune' },
  ];
  m.risks = [
    newRisk({ id: 'r1', title: 'Hausse du prix de la farine', category: 'approvisionnement', likelihood: 3, impact: 4, mitigation: 'Contrat annuel avec la minoterie', owner: 'Gérant' }),
    newRisk({ id: 'r2', title: 'Départ du pâtissier', category: 'humain', likelihood: 2, impact: 3, mitigation: 'Formation d’un second', owner: 'Gérant' }),
  ];
  m.swot = { strengths: ['Fournil sur place', 'Gérant expérimenté'], weaknesses: ['Nouvelle marque'], opportunities: ['Commandes des hôtels'], threats: ['Concurrence proche'] };
  m.pestel = { political: [], economic: ['Prix des matières premières'], social: ['Habitudes de consommation quotidiennes'], technological: [], environmental: [], legal: ['Normes d’hygiène ONSSA'] };
  m.narrative = {
    executiveSummary: 'Création d’une boulangerie-pâtisserie à Guéliz financée par 400 000 MAD d’apports et un crédit bancaire.',
    marketAnalysis: 'Analyse de marché saisie par le porteur de projet.', conclusion: 'Projet soumis à l’appréciation de la banque.',
  };
  return m;
}

/** Existing metal workshop in Casablanca with an opening balance and an expansion investment. */
export function workshopCase(years = 10, startMonth = '2027-01'): StudyModel {
  const m = emptyModel({ startMonth, years, sector: 'manufacturing', projectType: 'expansion' });
  m.profile.company = {
    ...m.profile.company, name: 'Atelier Métal Ain Sebaâ SA', legalForm: 'sa', city: 'Casablanca', activity: 'Chaudronnerie et charpente métallique',
    incorporated: true, ice: '002345678000071', rc: '234567', if: '56789012', cnss: '8765432',
  };
  m.profile.directors = [{ id: 'd1', name: 'Karim Tazi', position: 'Directeur général', history: '', qualifications: 'Ingénieur', experienceYears: 20 }];
  m.profile.shareholders = [{ id: 'a1', name: 'Famille Tazi', ownershipPct: 100, contribution: 0, commitment: '' }];
  m.sectorInputs = { capacityUnitsPerYear: 840 };
  m.general.inflationPct = 2;
  m.general.discountRatePct = 12;
  m.general.terminalGrowthPct = 2;
  m.products = [
    newProduct({ id: 'charp', name: 'Charpentes (tonnes)', unitPrice: 26000, volumeMonth1: 40, volumeGrowthPct: [6, 5, 4, 3], unitCost: 14500, unitCostGrowthPct: 2, priceGrowthPct: 2, capacityPerMonth: 70, utilizationPct: 90 }),
    newProduct({ id: 'chaud', name: 'Chaudronnerie sur mesure', unitPrice: 95000, volumeMonth1: 4, volumeGrowthPct: [8, 5], unitCost: 52000 }),
  ];
  m.expenses = [
    newExpense({ id: 'elec', name: 'Énergie', category: 'utilities', behavior: 'variable_revenue_pct', pctOfRevenue: 3, vatRatePct: 20 }),
    newExpense({ id: 'consom', name: 'Consommables de soudure', category: 'raw_materials', behavior: 'variable_revenue_pct', pctOfRevenue: 2, vatRatePct: 20 }),
    newExpense({ id: 'transp', name: 'Transport des livraisons', category: 'logistics', behavior: 'variable_revenue_pct', pctOfRevenue: 2.5, vatRatePct: 20 }),
    newExpense({ id: 'admin', name: 'Frais administratifs', category: 'admin', amountMonthly: 25000, vatRatePct: 20 }),
    newExpense({ id: 'sst', name: 'Sous-traitance galvanisation', category: 'subcontracting', behavior: 'variable_revenue_pct', pctOfRevenue: 4, vatRatePct: 20 }),
  ];
  m.staff = [
    newStaff({ id: 'dir', role: 'Direction', headcount: 2, grossMonthly: 35000, annualRaisePct: 3 }),
    newStaff({ id: 'ouv', role: 'Soudeurs et monteurs', headcount: 28, grossMonthly: 5200, annualRaisePct: 3 }),
    newStaff({ id: 'adm', role: 'Administration', headcount: 5, grossMonthly: 7000, annualRaisePct: 3 }),
    newStaff({ id: 'ouv2', role: 'Soudeurs (extension)', headcount: 10, grossMonthly: 5200, annualRaisePct: 3, startMonth: 12 }),
  ];
  m.investments = [
    newInvestment({ id: 'pont', name: 'Pont roulant et cisaille', phase: 'expansion', amountHT: 2400000, usefulLifeYears: 10, month: 6, method: 'declining', decliningCoefficient: 2 }),
    newInvestment({ id: 'bat', name: 'Extension du hangar', phase: 'expansion', amountHT: 3200000, usefulLifeYears: 20, month: 3 }),
  ];
  m.financing.loans = [newLoan({ id: 'cmt', name: 'Crédit moyen terme', principal: 4000000, annualRatePct: 6, termMonths: 84, graceMonths: 12, month: 3, feesPct: 0.5 })];
  m.financing.overdraftRatePct = 8.5;
  m.financing.dividends = { payoutPct: 40, fromFiscalYearIndex: 1, paymentMonthOfFiscalYear: 6, withholdingRatePct: 0, withholdingMode: 'legal' };
  m.workingCapital = { cashSalesPct: 10, dsoDays: 75, dpoDays: 60, inventoryDays: 45, badDebtPct: 1, minimumCash: 500000 };
  m.tax.applyMinimumContributionExemption = false;
  m.openingBalance = {
    enabled: true, cash: 1800000, receivables: 3200000, inventory: 1500000, vatCredit: 0, fixedAssetsGross: 9000000,
    accumulatedDepreciation: 4200000, remainingLifeYears: 6, payables: 1900000, vatPayable: 180000, socialPayable: 160000, isPayable: 0,
    debtBalance: 1200000, debtAnnualRatePct: 6.5, debtRemainingMonths: 36, capital: 5000000, reserves: 2860000, priorYearIsDue: 420000,
  };
  return m;
}

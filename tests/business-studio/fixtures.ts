import {
  emptyModel, newExpense, newInvestment, newLoan, newProduct, newStaff, type StudyModel,
} from '../../app/lib/business-studio/model';

/** A complete trading/service study exercising every engine path. */
export function richModel(years = 5, startMonth = '2026-01'): StudyModel {
  const m = emptyModel({ startMonth, years, sector: 'retail', projectType: 'creation' });
  m.general.inflationPct = 2;
  m.general.discountRatePct = 12;
  m.products = [
    newProduct({
      id: 'p1', name: 'Produit A', unitPrice: 250, priceGrowthPct: 3, volumeMonth1: 400, volumeGrowthPct: [25, 15, 8],
      seasonality: [0.8, 0.8, 1, 1, 1.1, 1.2, 1.3, 1.3, 1, 0.9, 0.8, 0.8], discountPct: 2, returnsPct: 1,
      unitCost: 120, unitCostGrowthPct: 2, vatRatePct: 20, purchaseVatRatePct: 20, capacityPerMonth: 900, utilizationPct: 90,
    }),
    newProduct({
      id: 'p2', name: 'Abonnement', kind: 'subscription', unitPrice: 299, volumeMonth1: 30, volumeGrowthPct: [10],
      churnPctMonthly: 3, cacPerCustomer: 150, unitCost: 20, vatRatePct: 20, launchMonth: 3,
    }),
    newProduct({
      id: 'p3', name: 'Extension', phase: 'expansion', unitPrice: 1200, volumeMonth1: 20, volumeGrowthPct: [5],
      unitCost: 700, vatRatePct: 10, purchaseVatRatePct: 10, launchMonth: 18,
    }),
  ];
  m.expenses = [
    newExpense({ id: 'e1', name: 'Loyer', category: 'rent', amountMonthly: 15000, vatRatePct: 20 }),
    newExpense({ id: 'e2', name: 'Marketing', category: 'marketing', behavior: 'variable_revenue_pct', pctOfRevenue: 4, paymentDelayDays: 45 }),
    newExpense({ id: 'e3', name: 'Assurance', category: 'insurance', amountMonthly: 1500, vatRatePct: 20, vatDeductible: false }),
    newExpense({ id: 'e4', name: 'Honoraires', category: 'fees', amountMonthly: 3000, startMonth: 2, endMonth: 40, growthPct: 5, indexedOnInflation: false }),
  ];
  m.staff = [
    newStaff({ id: 's1', role: 'Gérant', grossMonthly: 18000, dependants: 2, annualRaisePct: 3 }),
    newStaff({ id: 's2', role: 'Vendeur', headcount: 3, grossMonthly: 5500, startMonth: 1 }),
    newStaff({ id: 's3', role: 'Technicien', headcount: 2, grossMonthly: 8000, startMonth: 18 }),
  ];
  m.investments = [
    newInvestment({ id: 'i1', name: 'Aménagement', amountHT: 300000, usefulLifeYears: 10 }),
    newInvestment({ id: 'i2', name: 'Matériel', amountHT: 180000, usefulLifeYears: 5, method: 'declining', decliningCoefficient: 2, month: 6 }),
    newInvestment({ id: 'i3', name: 'Logiciel', kind: 'intangible', amountHT: 60000, usefulLifeYears: 3, month: 1 }),
    newInvestment({ id: 'i4', name: 'Terrain', kind: 'land', amountHT: 200000, vatRatePct: 0 }),
    newInvestment({ id: 'i5', name: 'Extension', phase: 'expansion', amountHT: 250000, usefulLifeYears: 8, month: 17 }),
  ];
  m.financing.equity = [{ id: 'q1', name: 'Capital', amount: 600000, month: 0 }];
  m.financing.loans = [
    newLoan({ id: 'l1', principal: 500000, annualRatePct: 6.5, termMonths: 84, graceMonths: 12, feesPct: 1 }),
    newLoan({ id: 'l2', name: 'Compte courant', kind: 'shareholder', principal: 100000, annualRatePct: 0, termMonths: 24, method: 'bullet', month: 2 }),
    newLoan({ id: 'l3', principal: 150000, annualRatePct: 7, termMonths: 36, graceMonths: 6, graceType: 'capitalized', method: 'constant_principal', month: 17 }),
  ];
  m.financing.grants = [
    { id: 'g1', name: 'Subvention équipement', kind: 'investment', amount: 60000, month: 3, amortizationYears: 5 },
    { id: 'g2', name: 'Aide exploitation', kind: 'operating', amount: 24000, month: 4, amortizationYears: 0 },
  ];
  m.financing.leases = [
    { id: 'lz1', name: 'Véhicule', monthlyRentHT: 4000, vatRatePct: 20, startMonth: 0, termMonths: 36, purchaseOptionHT: 20000, optionAssetLifeYears: 4 },
  ];
  m.financing.overdraftRatePct = 9;
  m.financing.dividends = { payoutPct: 30, fromFiscalYearIndex: 2, paymentMonthOfFiscalYear: 7, withholdingRatePct: 0 };
  m.workingCapital = { cashSalesPct: 40, dsoDays: 45, dpoDays: 60, inventoryDays: 30, badDebtPct: 1, minimumCash: 50000 };
  m.tax.vatRegime = 'encaissement';
  return m;
}

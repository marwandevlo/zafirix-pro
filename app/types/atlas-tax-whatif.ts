/** AI Tax What-If Planner — scenario inputs, results, and comparisons. */

import type { AtlasIsLiquidation } from '@/app/lib/atlas-payroll-calculations';

export type WhatIfAdjustments = {
  revenueDeltaPct?: number;
  revenueDeltaAbs?: number;
  supplierDeltaPct?: number;
  supplierDeltaAbs?: number;
  payrollDeltaPct?: number;
  payrollDeltaAbs?: number;
  accountingDeltaPct?: number;
  accountingDeltaAbs?: number;
  assetPurchaseHT?: number;
  assetVatRate?: number;
};

export type WhatIfBaseline = {
  fiscalYear: number;
  revenueHT: number;
  supplierExpensesHT: number;
  payrollTotal: number;
  accountingCharges: number;
  assetPurchaseHT: number;
  taxableResult: number;
  is: AtlasIsLiquidation;
  tvaCollectee: number;
  tvaDeductible: number;
  tvaNet: number;
  effectiveSalesVatRate: number;
  effectivePurchaseVatRate: number;
  formulaVersion: string;
  disclaimer: string;
};

export type WhatIfScenarioResult = {
  label: string;
  revenueHT: number;
  supplierExpensesHT: number;
  payrollTotal: number;
  accountingCharges: number;
  assetPurchaseHT: number;
  taxableResult: number;
  is: AtlasIsLiquidation;
  tvaCollectee: number;
  tvaDeductible: number;
  tvaNet: number;
  deltaVsBaseline: {
    revenueHT: number;
    taxableResult: number;
    isDue: number;
    tvaNet: number;
    totalTaxBurden: number;
  };
};

export type WhatIfComparison = {
  baseline: WhatIfBaseline;
  scenario: WhatIfScenarioResult;
  adjustments: WhatIfAdjustments;
};

export type SavedWhatIfScenario = {
  id: string;
  name: string;
  fiscalYear: number;
  baseline: WhatIfBaseline;
  adjustments: WhatIfAdjustments;
  results: WhatIfScenarioResult;
  aiProjection: string | null;
  aiProvider: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WhatIfDashboard = {
  baseline: WhatIfBaseline;
  savedScenarios: SavedWhatIfScenario[];
  lastComparison: WhatIfComparison | null;
};

export type WhatIfAiProjection = {
  summary: string;
  isAnalysis: string;
  tvaAnalysis: string;
  recommendations: string[];
  risks: string[];
  provider: string;
  disclaimer: string;
};

export const DEFAULT_ASSET_VAT_RATE = 0.2;
export const DEFAULT_SALES_VAT_RATE = 0.2;
export const DEFAULT_PURCHASE_VAT_RATE = 0.2;

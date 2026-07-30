/** Corporate Real Estate & Asset Ledger types. */

export type AssetCategory = 'real_estate' | 'equipment' | 'vehicle' | 'it' | 'furniture' | 'other';

export type AssetClass = 'corporel' | 'incorporel' | 'financier' | 'non_valeur';

export type AssetStatus = 'draft' | 'active' | 'fully_depreciated' | 'disposed';

export type DepreciationMethod = 'linear';

export type ScheduleStatus = 'planned' | 'posted' | 'skipped';

export type AtlasFixedAsset = {
  id: string;
  companyId: string | null;
  assetCode: string;
  name: string;
  description: string | null;
  assetCategory: AssetCategory;
  assetClass: AssetClass;
  location: string | null;
  pcgeAssetAccount: string;
  pcgeAmortAccount: string;
  pcgeChargeAccount: string;
  acquisitionDate: string;
  acquisitionCostHT: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  depreciationStartDate: string | null;
  accumulatedDepreciation: number;
  bookValue: number;
  status: AssetStatus;
  sourceDocumentId: string | null;
  sourceInvoiceId: string | null;
  disposalDate: string | null;
  disposalAmount: number | null;
  monthlyDepreciation: number;
  createdAt: string;
  updatedAt: string;
};

export type AtlasDepreciationSchedule = {
  id: string;
  assetId: string;
  assetName?: string;
  assetCode?: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  openingNbv: number;
  depreciationAmount: number;
  closingNbv: number;
  status: ScheduleStatus;
  accountingEntryIds: string[];
  postedAt: string | null;
  pcgeChargeAccount?: string;
  pcgeAmortAccount?: string;
};

export type AtlasAssetEvent = {
  id: string;
  assetId: string;
  eventType: string;
  title: string;
  body: string | null;
  createdAt: string;
};

export type FixedAssetsDashboardSummary = {
  totalAssets: number;
  activeAssets: number;
  totalGrossValue: number;
  totalAccumulatedDepreciation: number;
  totalBookValue: number;
  plannedSchedules: number;
  postedSchedules: number;
  realEstateCount: number;
};

export type FixedAssetsPayload = {
  assets: AtlasFixedAsset[];
  schedules: AtlasDepreciationSchedule[];
  events: AtlasAssetEvent[];
  summary: FixedAssetsDashboardSummary;
};

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  real_estate: 'Immobilier corporate',
  equipment: 'Équipement',
  vehicle: 'Véhicule',
  it: 'Matériel informatique',
  furniture: 'Mobilier',
  other: 'Autre',
};

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  corporel: 'Immobilisation corporelle',
  incorporel: 'Immobilisation incorporelle',
  financier: 'Immobilisation financière',
  non_valeur: 'Immobilisation en non-valeurs',
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  fully_depreciated: 'Amorti',
  disposed: 'Cédé',
};

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  planned: 'Planifié',
  posted: 'Comptabilisé',
  skipped: 'Ignoré',
};

/** Default PCGE accounts by asset category (Maroc PCGE). */
export const DEFAULT_PCGE_BY_CATEGORY: Record<
  AssetCategory,
  { asset: string; amort: string; charge: string }
> = {
  real_estate: { asset: '232000', amort: '283200', charge: '619300' },
  equipment: { asset: '234000', amort: '283400', charge: '619300' },
  vehicle: { asset: '234100', amort: '283410', charge: '619300' },
  it: { asset: '235000', amort: '283500', charge: '619300' },
  furniture: { asset: '233000', amort: '283300', charge: '619300' },
  other: { asset: '238000', amort: '283800', charge: '619300' },
};

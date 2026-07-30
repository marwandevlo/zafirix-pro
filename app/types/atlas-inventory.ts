/** Multi-store inventory — types aligned with zafirix_stores / items / stock / movements / transfers / COGS. */

export type StoreType = 'warehouse' | 'point_of_sale' | 'both';

export type AtlasStore = {
  id: string;
  companyId: string | null;
  name: string;
  code: string;
  address: string | null;
  storeType: StoreType;
  isActive: boolean;
  createdAt: string;
};

export type AtlasInventoryItem = {
  id: string;
  companyId: string | null;
  sku: string;
  name: string;
  unit: string;
  reorderLevel: number;
  unitCost: number;
  salePrice: number;
  category: string;
  createdAt: string;
};

export type AtlasInventoryStock = {
  id: string;
  storeId: string;
  itemId: string;
  quantity: number;
  updatedAt: string;
  storeName?: string;
  itemName?: string;
  itemSku?: string;
  reorderLevel?: number;
  unit?: string;
  unitCost?: number;
  valuation?: number;
  isLowStock?: boolean;
};

export type InventoryMovementType =
  | 'in'
  | 'out'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'sale'
  | 'usage'
  | 'purchase'
  | 'return';

export type AtlasStockMovement = {
  id: string;
  companyId: string | null;
  storeId: string;
  itemId: string;
  movementType: InventoryMovementType;
  quantityDelta: number;
  quantityAfter: number;
  unitCost: number;
  totalCost: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
  storeName?: string;
  itemName?: string;
  itemSku?: string;
};

export type StockTransferStatus = 'pending' | 'approved' | 'in_transit' | 'completed' | 'cancelled';

export type AtlasStockTransferLine = {
  itemId: string;
  quantity: number;
  unitCost: number;
  itemName?: string;
  itemSku?: string;
};

export type AtlasStockTransfer = {
  id: string;
  companyId: string | null;
  fromStoreId: string;
  toStoreId: string;
  status: StockTransferStatus;
  notes: string | null;
  requestedAt: string;
  completedAt: string | null;
  createdAt: string;
  fromStoreName?: string;
  toStoreName?: string;
  lines: AtlasStockTransferLine[];
};

export type AtlasInvoiceCogsLine = {
  id: string;
  invoiceId: string;
  storeId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  cogsAmount: number;
  movementId: string | null;
  createdAt: string;
  itemName?: string;
  itemSku?: string;
  storeName?: string;
};

export type InventoryDashboardSummary = {
  storeCount: number;
  itemCount: number;
  totalUnits: number;
  totalValuation: number;
  lowStockCount: number;
  pendingTransfers: number;
};

export type InventoryDashboardPayload = {
  stores: AtlasStore[];
  items: AtlasInventoryItem[];
  stock: AtlasInventoryStock[];
  movements?: AtlasStockMovement[];
  transfers?: AtlasStockTransfer[];
  cogsLines?: AtlasInvoiceCogsLine[];
  summary: InventoryDashboardSummary;
};

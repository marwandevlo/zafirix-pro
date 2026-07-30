/**
 * Enterprise modules hub — re-exports inventory, logistics, petty cash, notifications, debt, auditor.
 * Prefer importing from dedicated atlas-<module>.ts files in new code.
 */

export type {
  StoreType,
  AtlasStore,
  AtlasInventoryItem,
  AtlasInventoryStock,
  InventoryMovementType,
  AtlasStockMovement,
  StockTransferStatus,
  AtlasStockTransferLine,
  AtlasStockTransfer,
  AtlasInvoiceCogsLine,
  InventoryDashboardSummary,
  InventoryDashboardPayload,
} from '@/app/types/atlas-inventory';

export type {
  NotificationChannel,
  NotificationCategory,
  NotificationStatus,
  NotificationQueueStatus,
  AtlasNotification,
  AtlasNotificationQueueItem,
  NotificationsListPayload,
  NotificationScanResult,
} from '@/app/types/atlas-notifications';

export type {
  DeliveryStatus,
  AtlasDeliveryPartner,
  AtlasShipmentTrackingEvent,
  CodCollectionMethod,
  AtlasCodReconciliation,
  AtlasDelivery,
  LogisticsDashboardSummary,
  LogisticsDashboardPayload,
} from '@/app/types/atlas-logistics';

export type {
  PettyCashEntryType,
  PettyCashStatus,
  PettyCashVoucherStatus,
  PettyCashApprovalStep,
  AtlasPettyCashFund,
  AtlasPettyCashAttachment,
  AtlasPettyCashApproval,
  AtlasPettyCashVoucher,
  AtlasPettyCashReconciliation,
  AtlasPettyCashEntry,
  PettyCashDashboardPayload,
} from '@/app/types/atlas-petty-cash';

export type {
  DebtCollectionStage,
  AtlasDebtCollectionCase,
} from '@/app/types/atlas-debt-collection';

export type { AtlasAuditorPass } from '@/app/types/atlas-auditor-pass';

/**
 * Re-exports for backward compatibility. Prefer core vs register imports in API routes.
 */
export {
  assertStoragePathOwnedByUser,
  logUploadStep,
  prepareStorageUploadSlot,
  verifyStorageObjectExists,
  type PrepareStorageSlotInput,
  type PrepareStorageSlotResult,
  type UploadLogContext,
} from '@/app/lib/atlas-document-upload-core';

export {
  registerStoredDocument,
  removeOrphanStorageObject,
  type RegisterStoredDocumentInput,
  type RegisterStoredDocumentResult,
} from '@/app/lib/atlas-document-upload-register';

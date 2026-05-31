/**
 * Map API HTTP status + error codes to French user-facing messages.
 */

export function frenchMessageForUploadHttpStatus(status: number, code?: string, step?: string): string {
  if (code === 'prepare_failed' || (step === 'prepare' && status >= 500)) {
    return 'Échec de la préparation du téléversement. Réessayez dans quelques instants.';
  }
  if (status === 401 || code === 'auth_required') {
    return 'Session expirée. Reconnectez-vous.';
  }
  if (status === 403 || code === 'storage_permission_denied' || code === 'company_not_found_or_forbidden') {
    return 'Autorisation stockage refusée.';
  }
  if (status === 413 || code === 'file_too_large') {
    return 'Pour les gros fichiers, compressez le document avant téléversement. Le support 50 Mo est en cours de stabilisation.';
  }
  if (status === 408 || code === 'upload_timeout' || code === 'ocr_timeout') {
    return 'Délai dépassé. Réessayez avec une connexion stable.';
  }
  if (code === 'db_insert_failed') {
    return 'Impossible d’enregistrer le document en base de données.';
  }
  if (code === 'storage_file_uploaded_register_failed' || code === 'register_failed') {
    return 'Fichier téléversé, mais l’enregistrement du document a échoué. Réessayez.';
  }
  if (code === 'storage_service_read_failed') {
    return 'Le serveur ne peut pas lire le fichier téléversé.';
  }
  if (code === 'working_copy_failed') {
    return 'Échec de la copie de travail pour l’OCR.';
  }
  if (code === 'ocr_enqueue_failed') {
    return 'Document enregistré, mais l’OCR n’a pas pu démarrer.';
  }
  if (status >= 500 && code === 'server_error') {
    return 'Erreur serveur. Réessayez dans quelques instants.';
  }
  return '';
}

export function sanitizeUploadUserMessage(message: string | undefined): string | null {
  if (!message?.trim()) return null;
  const m = message.trim();
  if (m === 'StorageApiError' || m === 'StorageError' || /^Storage\w*Error$/i.test(m)) {
    return null;
  }
  return m;
}

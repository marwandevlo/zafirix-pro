/**
 * French user-facing messages for document register / post-storage failures.
 */

export function frenchMessageForRegisterCode(code: string, rawMessage?: string): string {
  switch (code) {
    case 'storage_path_forbidden':
      return 'Chemin de stockage invalide pour ce compte.';
    case 'company_not_found_or_forbidden':
      return 'Société active introuvable ou non autorisée.';
    case 'file_too_large':
      return 'Pour les gros fichiers, compressez le document avant téléversement. Le support 50 Mo est en cours de stabilisation.';
    case 'storage_object_missing':
      return 'Le fichier n’a pas été trouvé dans le stockage après le téléversement. Réessayez.';
    case 'storage_verify_failed':
      return 'Impossible de vérifier le fichier dans le stockage. Réessayez.';
    case 'storage_service_read_failed':
      return 'Le serveur ne peut pas lire le fichier téléversé. Contactez le support.';
    case 'storage_file_uploaded_register_failed':
      return 'Fichier téléversé, mais l’enregistrement du document a échoué. Réessayez.';
    case 'working_copy_failed':
      return 'Échec de la copie de travail pour l’OCR. Réessayez avec une autre image.';
    case 'image_compress_failed':
      return 'Compression automatique impossible. Réessayez avec une autre image.';
    case 'db_insert_failed':
      return 'Impossible d’enregistrer le document en base de données.';
    case 'register_failed':
      return 'Échec de l’enregistrement du document après téléversement.';
    case 'ocr_enqueue_failed':
      return 'Document enregistré, mais l’OCR n’a pas pu démarrer. Réessayez depuis la liste.';
    case 'server_misconfigured':
      return 'Configuration serveur incomplète (clé service). Contactez le support.';
    default:
      break;
  }

  const raw = rawMessage?.trim();
  if (raw && !/^Storage\w*Error$/i.test(raw) && raw.length < 200) {
    return raw;
  }
  return 'Échec de l’enregistrement du document. Réessayez.';
}

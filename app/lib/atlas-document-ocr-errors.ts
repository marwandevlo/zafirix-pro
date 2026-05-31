/** French user-facing OCR error messages (production UI). */
export function frenchOcrErrorMessage(code: string, fallback?: string): string {
  const map: Record<string, string> = {
    storage_download_failed: 'Impossible de lire le fichier dans le stockage. Réessayez.',
    pdf_render_failed: 'Impossible de lire le PDF (fichier corrompu ou protégé).',
    pdf_required: 'Ce document n’est pas un PDF.',
    image_required: 'Ce document n’est pas une image.',
    storage_path_missing: 'Fichier introuvable (chemin manquant).',
    ocr_failed: 'L’analyse OCR a échoué sur toutes les pages.',
    ocr_timeout: 'Délai d’analyse dépassé. Compressez le PDF ou réduisez le nombre de pages.',
    image_compress_failed: 'Impossible de préparer l’image pour l’analyse.',
    db_update_failed: 'Erreur lors de l’enregistrement des résultats. Réessayez.',
    ocr_stuck_timeout:
      'Analyse interrompue (aucune progression depuis plus de 5 minutes). Relancez l’analyse ou réimportez le fichier.',
    ai_provider_error: 'Service d’analyse indisponible. Réessayez dans quelques minutes.',
    document_not_found: 'Document introuvable.',
  };
  return map[code] ?? fallback ?? 'Analyse OCR échouée. Réessayez.';
}

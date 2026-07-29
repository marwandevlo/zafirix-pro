/**
 * POST /api/documents/[id]/backup-to-drive
 * Backs up a document export to the user's Google Drive.
 * Body: { format?: 'pdf'|'json'|'csv'|'xml'|'xlsx'|'zip' }
 * Creates full Zafirix Pro folder structure if needed.
 * Logs to zafirix_backups + atlas_entity_events + zafirix_file_versions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  getValidCredentials,
  ensureVaultBackupFolder,
  vaultCategoryForDocumentType,
  uploadFileToDrive,
  mimeTypeForFormat,
} from '@/app/lib/atlas-google-drive';
import {
  exportToJson,
  exportToCsv,
  exportToXml,
  exportToXlsx,
  exportToDocx,
  exportToZip,
  exportFilename,
} from '@/app/lib/atlas-document-export';
import { generateDocumentPdf, documentPdfFilename } from '@/app/lib/atlas-document-pdf-export';
import { documentTypeFromDocument } from '@/app/lib/atlas-documents-repository';
import type { AtlasDocument } from '@/app/types/atlas-document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BackupBody = { format?: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: BackupBody = {};
  try { body = await request.json() as BackupBody; } catch { /* defaults */ }
  const format = body.format ?? 'pdf';

  const admin = getSupabaseServiceRoleClient();

  // Get document
  const { data: doc, error: docErr } = await admin
    .from('atlas_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (docErr || !doc) return NextResponse.json({ error: 'document_not_found' }, { status: 404 });

  const docRecord = doc as Record<string, unknown>;

  // Check Google Drive credentials
  const credentials = await getValidCredentials(userId);
  if (!credentials) {
    return NextResponse.json({
      error: 'google_drive_not_connected',
      localFallback: true,
      message: 'Google Drive non connecté — téléchargement local disponible.',
    }, { status: 400 });
  }

  // Get company for branding + folder name
  let companyName = 'Mon entreprise';
  let company = null;
  if (docRecord.company_id) {
    const { data: co } = await admin
      .from('atlas_companies')
      .select('raisonSociale, ice, if_fiscal, rc, adresse, ville, telephone, email')
      .eq('id', String(docRecord.company_id))
      .maybeSingle();
    if (co) {
      company = co;
      companyName = String((co as Record<string, unknown>).raisonSociale ?? 'Mon entreprise');
    }
  }

  // Insert pending backup record
  const { data: backupRow } = await admin
    .from('zafirix_backups')
    .insert({
      user_id: userId,
      company_id: docRecord.company_id ?? null,
      entity_type: 'document',
      entity_id: documentId,
      provider: 'google_drive',
      file_format: format,
      filename: format === 'pdf' ? documentPdfFilename(doc as AtlasDocument) : exportFilename(doc as AtlasDocument, format),
      sync_status: 'syncing',
    })
    .select('id')
    .single();

  const backupId = backupRow?.id;

  // Audit: backup started
  void admin.from('atlas_entity_events').insert({
    user_id: userId,
    company_id: docRecord.company_id ?? null,
    entity_type: 'document',
    entity_id: documentId,
    event_type: 'backup_started',
    payload: { provider: 'google_drive', format, backup_id: backupId },
  });

  try {
    // Vault folder: Company → Year → Category
    const docType = documentTypeFromDocument(doc as AtlasDocument);
    const category = vaultCategoryForDocumentType(docType);
    const year = new Date(String(docRecord.created_at ?? Date.now())).getFullYear().toString();
    const vaultFolder = await ensureVaultBackupFolder(
      credentials.accessToken,
      companyName,
      year,
      category,
    );

    // Generate export content
    let content: string | Buffer | ArrayBuffer;
    let filename: string;
    switch (format) {
      case 'json':  content = exportToJson(doc as AtlasDocument);  break;
      case 'csv':   content = exportToCsv(doc as AtlasDocument);   break;
      case 'xml':   content = exportToXml(doc as AtlasDocument);   break;
      case 'xlsx':  content = await exportToXlsx(doc as AtlasDocument); break;
      case 'docx':  content = await exportToDocx(doc as AtlasDocument); break;
      case 'zip':   content = await exportToZip(doc as AtlasDocument);  break;
      default:      content = generateDocumentPdf(doc as AtlasDocument, company); break;
    }
    filename = format === 'pdf'
      ? documentPdfFilename(doc as AtlasDocument)
      : exportFilename(doc as AtlasDocument, format);

    // Convert to Buffer
    const buffer: Buffer =
      content instanceof ArrayBuffer
        ? Buffer.from(content)
        : typeof content === 'string'
          ? Buffer.from(content, 'utf-8')
          : content as Buffer;

    // Upload to Drive (Documents IA folder)
    const mimeType = mimeTypeForFormat(format);
    const driveResult = await uploadFileToDrive(
      credentials.accessToken,
      vaultFolder.folderId,
      filename,
      mimeType,
      buffer,
    );

    const sizeBytes = buffer.length;

    // Update backup record to completed
    await admin.from('zafirix_backups').update({
      sync_status: 'completed',
      provider_file_id: driveResult.id,
      provider_folder_id: vaultFolder.folderId,
      provider_url: driveResult.webViewLink,
      filename,
      file_size_bytes: sizeBytes,
      last_synced_at: new Date().toISOString(),
    }).eq('id', backupId);

    // File version record
    void admin.from('zafirix_file_versions').insert({
      user_id: userId,
      company_id: docRecord.company_id ?? null,
      entity_type: 'document',
      entity_id: documentId,
      file_format: format,
      filename,
      file_size_bytes: sizeBytes,
      google_drive_file_id: driveResult.id,
      google_drive_url: driveResult.webViewLink,
    });

    // Audit: backup completed
    void admin.from('atlas_entity_events').insert({
      user_id: userId,
      company_id: docRecord.company_id ?? null,
      entity_type: 'document',
      entity_id: documentId,
      event_type: 'backup_completed',
      payload: { provider: 'google_drive', format, file_id: driveResult.id, size_bytes: sizeBytes, vault_path: vaultFolder.path },
    });

    return NextResponse.json({
      ok: true,
      driveFileId: driveResult.id,
      driveUrl: driveResult.webViewLink,
      filename,
      sizeBytes,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'backup_failed';

    // Mark as failed
    void admin.from('zafirix_backups').update({
      sync_status: 'failed',
      error_message: errorMsg,
    }).eq('id', backupId);

    void admin.from('atlas_entity_events').insert({
      user_id: userId,
      company_id: docRecord.company_id ?? null,
      entity_type: 'document',
      entity_id: documentId,
      event_type: 'backup_failed',
      payload: { provider: 'google_drive', format, error: errorMsg },
    });

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

/**
 * Production OCR E2E: create doc in Storage + run OCR (local runner against prod DB).
 * Usage: node scripts/prod-ocr-e2e.mjs <label> <localFilePath> <mimeType>
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('./mock-server-only.cjs');

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

loadEnv();

const label = process.argv[2];
const filePath = process.argv[3];
const mimeType = process.argv[4] || 'application/pdf';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceKey);

const STUCK_ID = 'a9a133a9-2621-4897-bfdd-8b84b5a5d14b';

const { data: ref } = await admin
  .from('atlas_documents')
  .select('user_id, company_id')
  .eq('id', STUCK_ID)
  .maybeSingle();

if (!ref?.user_id || !ref?.company_id) {
  console.error('Reference document missing');
  process.exit(1);
}

const { user_id: userId, company_id: companyId } = ref;
const documentId = randomUUID();
const bytes = readFileSync(resolve(filePath));
const safeName = filePath.split(/[/\\]/).pop() || 'test.pdf';
const storagePath = `${userId}/${companyId}/${documentId}/${safeName}`;

const { error: upErr } = await admin.storage.from('atlas-documents').upload(storagePath, bytes, {
  contentType: mimeType,
  upsert: true,
});
if (upErr) {
  console.error('Storage upload failed', upErr.message);
  process.exit(1);
}

const { error: insErr } = await admin.from('atlas_documents').insert({
  id: documentId,
  user_id: userId,
  company_id: companyId,
  type: 'ocr',
  title: safeName,
  kind: 'upload',
  source: 'ocr',
  status: 'active',
  filename: safeName,
  mime_type: mimeType,
  size_bytes: bytes.length,
  storage_path: storagePath,
  processing_status: 'processing',
  metadata: { storage: { original_storage_path: storagePath } },
});

if (insErr) {
  console.error('DB insert failed', insErr.message);
  process.exit(1);
}

const start = Date.now();
// Run via: npx tsx scripts/prod-ocr-e2e.mjs ...
const { executeDocumentOcrServer } = await import('../app/lib/atlas-document-ocr-runner.ts');
await executeDocumentOcrServer(userId, documentId, 'retrigger');

const { data: after } = await admin
  .from('atlas_documents')
  .select('processing_status, extracted_text, metadata')
  .eq('id', documentId)
  .maybeSingle();

const ocr = after?.metadata?.ocr ?? {};
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const pass =
  after?.processing_status === 'processed' &&
  (ocr.page_count != null || mimeType.startsWith('image/')) &&
  (after?.extracted_text?.length ?? 0) > 0;

console.log(
  JSON.stringify(
    {
      label,
      documentId,
      fileDetected: true,
      pageCount: ocr.page_count ?? (mimeType.startsWith('image/') ? 1 : null),
      textExtracted: (after?.extracted_text?.length ?? 0) > 0,
      status: after?.processing_status,
      elapsedSec: elapsed,
      result: pass ? 'PASS' : 'FAIL',
    },
    null,
    2,
  ),
);

process.exit(pass ? 0 : 1);

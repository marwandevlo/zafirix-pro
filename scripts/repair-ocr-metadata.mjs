/**
 * Clear stale metadata.ocr.error on processed documents with real extracted_text.
 * Usage: node scripts/repair-ocr-metadata.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error } = await sb
  .from('atlas_documents')
  .select('id, filename, processing_status, extracted_text, metadata')
  .eq('source', 'ocr');

if (error) {
  console.error(error.message);
  process.exit(1);
}

let repaired = 0;
for (const row of rows ?? []) {
  const text = String(row.extracted_text ?? '').trim();
  if (row.processing_status !== 'processed' || text.length < 80) continue;
  if (/^Impossible de lire le PDF/i.test(text)) continue;

  const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  const ocr = meta.ocr && typeof meta.ocr === 'object' ? { ...meta.ocr } : {};
  if (!ocr.error) continue;

  delete ocr.error;
  ocr.progress_phase = 'completed';
  await sb
    .from('atlas_documents')
    .update({ metadata: { ...meta, ocr }, updated_at: new Date().toISOString() })
    .eq('id', row.id);

  console.log('repaired', row.id, row.filename);
  repaired++;
}

console.log('done, repaired=', repaired);

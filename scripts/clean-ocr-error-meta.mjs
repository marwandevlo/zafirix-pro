/** Clear stale OCR error metadata on an already-processed document. */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

const id = process.argv[2];
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('atlas_documents').select('metadata, processing_status').eq('id', id).maybeSingle();
if (!data) {
  console.error('not found');
  process.exit(1);
}
const meta = data.metadata ?? {};
const ocr = { ...(meta.ocr ?? {}) };
delete ocr.error;
ocr.progress_phase = 'completed';
await sb
  .from('atlas_documents')
  .update({ metadata: { ...meta, ocr }, updated_at: new Date().toISOString() })
  .eq('id', id);
console.log('cleaned', id, data.processing_status);

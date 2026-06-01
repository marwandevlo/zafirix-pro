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
const { data } = await sb.from('atlas_documents').select('*').eq('id', id).maybeSingle();
const ocr = data?.metadata?.ocr ?? {};
console.log(
  JSON.stringify(
    {
      processing_status: data?.processing_status,
      page_count: ocr.page_count,
      progress_phase: ocr.progress_phase,
      pages_processed: ocr.pages_processed,
      completed_at: ocr.completed_at,
      error: ocr.error,
      textLen: data?.extracted_text?.length ?? 0,
      preview: data?.extracted_text?.slice(0, 180),
    },
    null,
    2,
  ),
);

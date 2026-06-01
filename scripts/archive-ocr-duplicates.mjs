/**
 * Archive failed OCR duplicate rows when a better row exists for same company+filename.
 * Usage: node scripts/archive-ocr-duplicates.mjs [--apply]
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

const apply = process.argv.includes('--apply');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error } = await sb
  .from('atlas_documents')
  .select('id, company_id, filename, processing_status, extracted_text, storage_path, updated_at, metadata')
  .eq('source', 'ocr')
  .order('updated_at', { ascending: false });

if (error) {
  console.error(error.message);
  process.exit(1);
}

function rank(row) {
  const text = String(row.extracted_text ?? '').trim();
  if (row.processing_status === 'processed' && text.length >= 80 && !/^Impossible de lire/i.test(text)) {
    return 300;
  }
  if (row.processing_status === 'processing') return 200;
  return 100;
}

const groups = new Map();
for (const row of rows ?? []) {
  const key = `${row.company_id}:${String(row.filename ?? '').trim().toLowerCase()}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const toDelete = [];
for (const [key, list] of groups) {
  if (list.length < 2) continue;
  const sorted = [...list].sort((a, b) => {
    const d = rank(b) - rank(a);
    if (d !== 0) return d;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
  const keeper = sorted[0];
  for (const dup of sorted.slice(1)) {
    if (rank(keeper) >= rank(dup)) {
      toDelete.push({
        id: dup.id,
        filename: dup.filename,
        status: dup.processing_status,
        storage_path: dup.storage_path,
        keeper: keeper.id,
      });
    }
  }
}

console.log(JSON.stringify({ apply, duplicateCount: toDelete.length, samples: toDelete.slice(0, 10) }, null, 2));

if (!apply) {
  console.log('Dry run — pass --apply to delete duplicates');
  process.exit(0);
}

for (const dup of toDelete) {
  if (dup.storage_path) {
    await sb.storage.from('atlas-documents').remove([dup.storage_path]).catch(() => {});
  }
  await sb.from('atlas_documents').delete().eq('id', dup.id);
  console.log('deleted', dup.id, dup.filename, 'kept', dup.keeper);
}

console.log('deleted', toDelete.length);

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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const id = 'a9a133a9-2621-4897-bfdd-8b84b5a5d14b';
const { data: byId } = await sb.from('atlas_documents').select('id,filename,processing_status,updated_at').eq('id', id);
console.log('byId count', byId?.length ?? 0, byId);

const { data: byName } = await sb
  .from('atlas_documents')
  .select('id,filename,processing_status,size_bytes,updated_at,metadata')
  .ilike('filename', '%L2T MAROC%')
  .order('updated_at', { ascending: false })
  .limit(5);
console.log('byName', JSON.stringify(byName, null, 2));

const { data: recent } = await sb
  .from('atlas_documents')
  .select('id,filename,processing_status,updated_at')
  .eq('type', 'ocr')
  .order('updated_at', { ascending: false })
  .limit(10);
console.log('recent ocr', JSON.stringify(recent, null, 2));

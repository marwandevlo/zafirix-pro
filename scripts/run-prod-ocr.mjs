/** Run OCR job against production Supabase (local Node, not Vercel). */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);
require('./mock-server-only.cjs');

function loadEnvLocal() {
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

loadEnvLocal();

const documentId = process.argv[2];
const userId = process.argv[3];

if (!documentId || !userId) {
  console.error('Usage: node scripts/run-prod-ocr.mjs <documentId> <userId>');
  process.exit(1);
}

const start = Date.now();
const { executeDocumentOcrServer } = await import('../app/lib/atlas-document-ocr-runner.ts');
await executeDocumentOcrServer(userId, documentId, 'retrigger');
console.log('OCR finished in', ((Date.now() - start) / 1000).toFixed(1), 's');

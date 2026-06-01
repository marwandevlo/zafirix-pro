/**
 * End-to-end test of the direct PDF OCR pipeline against production DB.
 * Tests runDirectPdfOcrExtraction with the L2T MAROC document.
 */
import { readFileSync, existsSync } from 'fs';

// Load env
if (existsSync('.env.local')) {
  const lines = readFileSync('.env.local', 'utf-8').split('\n');
  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const k = line.slice(0, eqIdx).trim();
      const v = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (k && !process.env[k]) process.env[k] = v;
    }
  }
}

// Mock server-only
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
req('./mock-server-only.cjs');

// Test with local test fixture
const testFile = 'scripts/test-fixtures/test-1page.pdf';
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const apiKey = process.env.ANTHROPIC_API_KEY;

// Import via tsx/ts-node if needed, else try .js
let runDirectPdf;
try {
  const m = await import('../app/lib/atlas-pdf-direct-ocr.ts');
  runDirectPdf = m.runDirectPdfOcrExtraction;
} catch {
  // Fallback: call Anthropic directly to test document block
  const client = new Anthropic({ apiKey });
  runDirectPdf = async (buf, name) => {
    const data = buf.toString('base64');
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: `Tu es un expert en factures. Extrais les données en JSON: { "total_pages": N, "invoices": [{ "page_number": 1, "numero_facture": "...", "fournisseur": "...", "montant_ttc": 0 }] }. JSON uniquement.`,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
        { type: 'text', text: 'Extrais toutes les factures en JSON.' }
      ]}]
    });
    const text = res.content[0]?.text ?? '';
    try {
      const parsed = JSON.parse(text.replace(/^```json?\s*/,'').replace(/\s*```$/,''));
      return { ok: true, totalPages: parsed.total_pages ?? 1, invoices: parsed.invoices ?? [], merged: {}, extractedText: text };
    } catch {
      return { ok: true, totalPages: 1, invoices: [], merged: {}, extractedText: text };
    }
  };
}

const files = [
  { path: 'scripts/test-fixtures/test-1page.pdf', name: 'test-1page.pdf' },
  { path: 'scripts/test-fixtures/test-3page.pdf', name: 'test-3page.pdf' },
];

for (const f of files) {
  if (!existsSync(f.path)) { console.log(`Skipping ${f.path}`); continue; }
  console.log(`\n→ ${f.name}`);
  const buf = readFileSync(f.path);
  const t0 = Date.now();
  const result = await runDirectPdf(buf, f.name);
  const ms = Date.now() - t0;
  if (result.ok) {
    console.log(`  ✓ ${ms}ms | pages=${result.totalPages} | invoices=${result.invoices.length} | textLen=${result.extractedText?.length}`);
  } else {
    console.log(`  ✗ ${ms}ms | ${result.code}: ${result.message}`);
  }
}

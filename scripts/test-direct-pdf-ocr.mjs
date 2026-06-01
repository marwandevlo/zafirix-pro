/**
 * Test direct Anthropic PDF OCR locally.
 * Requires ANTHROPIC_API_KEY in .env.local
 */
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local' });

// Mock server-only
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('./mock-server-only.cjs');

const { runDirectPdfOcrExtraction } = await import('../app/lib/atlas-pdf-direct-ocr.js').catch(() =>
  import('../app/lib/atlas-pdf-direct-ocr.ts')
);

const testFiles = [
  'scripts/test-fixtures/test-1page.pdf',
  'scripts/test-fixtures/test-3page.pdf',
];

for (const filePath of testFiles) {
  if (!existsSync(filePath)) {
    console.log(`Skipping ${filePath} (not found)`);
    continue;
  }

  console.log(`\n→ Testing ${filePath}...`);
  const pdfBytes = readFileSync(filePath);
  const t0 = Date.now();

  try {
    const result = await runDirectPdfOcrExtraction(pdfBytes, filePath);
    const elapsed = Date.now() - t0;
    if (result.ok) {
      console.log(`  ✓ SUCCESS in ${elapsed}ms`);
      console.log(`  totalPages: ${result.totalPages}`);
      console.log(`  invoices: ${result.invoices.length}`);
      console.log(`  extractedText length: ${result.extractedText.length}`);
      console.log(`  merged:`, JSON.stringify(result.merged, null, 2));
    } else {
      console.error(`  ✗ FAILED in ${elapsed}ms`);
      console.error(`  code: ${result.code}, step: ${result.step}`);
      console.error(`  message: ${result.message}`);
    }
  } catch (err) {
    console.error(`  ✗ EXCEPTION: ${err.message}`);
  }
}

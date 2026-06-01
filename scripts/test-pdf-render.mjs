/**
 * Tests PDF rendering locally to diagnose pdf_render_failed.
 */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);

// Apply polyfill
const DOMMatrixPolyfill = (await import('@thednp/dommatrix')).default;
globalThis.DOMMatrix = DOMMatrixPolyfill;
console.log('✓ DOMMatrix polyfill set');

// Also set other globals pdfjs might need
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D { constructor() {} moveTo() {} lineTo() {} closePath() {} arc() {} rect() {} bezierCurveTo() {} quadraticCurveTo() {} addPath() {} };
  console.log('  Path2D polyfill set (dummy)');
}

const { pdf } = await import('pdf-to-img');
console.log('✓ pdf-to-img loaded');

// Test with the test fixtures
const testFiles = [
  'scripts/test-fixtures/test-1page.pdf',
  'scripts/test-fixtures/test-3page.pdf',
];

for (const filePath of testFiles) {
  if (!existsSync(filePath)) {
    console.log(`  Skipping ${filePath} (not found)`);
    continue;
  }
  
  console.log(`\n→ Testing ${filePath}...`);
  try {
    const pdfBytes = readFileSync(filePath);
    const t0 = Date.now();
    const doc = await pdf(pdfBytes, { scale: 1.5 });
    console.log(`  page count: ${doc.length}`);
    
    for (let i = 1; i <= doc.length; i++) {
      const t1 = Date.now();
      const page = await doc.getPage(i);
      console.log(`  page ${i}: ${page.length} bytes (${Date.now() - t1}ms)`);
    }
    
    if (typeof doc.destroy === 'function') await doc.destroy();
    console.log(`  ✓ Done in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error(`  ✗ ERROR: ${err.message}`);
    console.error(err.stack?.slice(0, 500));
  }
}

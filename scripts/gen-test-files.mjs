import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const dir = resolve(process.cwd(), 'scripts/test-fixtures');
mkdirSync(dir, { recursive: true });

function buildPdf(pageCount) {
  const pages = [];
  const kids = [];
  let objId = 4;
  const pageIds = [];

  for (let p = 0; p < pageCount; p++) {
    const content = `BT /F1 12 Tf 72 720 Td (FACTURE TEST P${p + 1} - Fournisseur DEMO - TTC 1200 MAD) Tj ET`;
    const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    pages.push(`${objId} 0 obj\n${stream}\nendobj`);
    pageIds.push(`${objId} 0 R`);
    objId++;
  }

  const kidsRef = pageIds.join(' ');
  const pagesObj = `${objId} 0 obj\n<< /Type /Pages /Kids [${kidsRef}] /Count ${pageCount} >>\nendobj`;
  objId++;
  const catalog = `${objId} 0 obj\n<< /Type /Catalog /Pages ${objId - 1} 0 R >>\nendobj`;
  objId++;

  const font = `2 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`;
  const pageObjs = [];
  let pid = 4;
  for (let p = 0; p < pageCount; p++) {
    pageObjs.push(
      `${pid + pageCount} 0 obj\n<< /Type /Page /Parent ${4 + pageCount * 2} 0 R /MediaBox [0 0 612 792] /Contents ${pid} 0 R /Resources << /Font << /F1 2 0 R >> >> >>\nendobj`,
    );
    pid++;
  }

  // Simpler single-structure PDF
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    `2 0 obj\n<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(' ')}] /Count ${pageCount} >>\nendobj`,
    font,
  ];

  for (let p = 0; p < pageCount; p++) {
    const n = 3 + p;
    const text = `BT /F1 12 Tf 72 720 Td (FACTURE TEST page ${p + 1} Fournisseur DEMO TTC 1200 MAD) Tj ET`;
    objects.push(
      `${n + pageCount} 0 obj\n<< /Length ${text.length} >>\nstream\n${text}\nendstream\nendobj`,
    );
    objects.push(
      `${n} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${n + pageCount} 0 R /Resources << /Font << /F1 2 0 R >> >> >>\nendobj`,
    );
  }

  const body = objects.join('\n');
  const xrefPos = body.length + 20;
  const maxId = 3 + pageCount * 2;
  const xref = `xref\n0 ${maxId}\n0000000000 65535 f \n${Array.from({ length: maxId - 1 }, () => '0000000000 00000 n \n').join('')}`;
  return `%PDF-1.4\n${body}\n${xref}\ntrailer\n<< /Size ${maxId} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
}

// Use pdfkit-free minimal: write 1-page known-good from hex
const onePage = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 68>>stream
BT /F1 12 Tf 72 720 Td (FACTURE TEST 1 page Fournisseur DEMO TTC 1200 MAD) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000261 00000 n 
0000000380 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
459
%%EOF`;

const threePage = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R 6 0 R 9 0 R]/Count 3>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 12 0 R>>>>>>endobj
4 0 obj<</Length 70>>stream
BT /F1 12 Tf 72 720 Td (FACTURE TEST page 1 Fournisseur DEMO TTC 1200 MAD) Tj ET
endstream
endobj
6 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 7 0 R/Resources<</Font<</F1 12 0 R>>>>>>endobj
7 0 obj<</Length 70>>stream
BT /F1 12 Tf 72 720 Td (FACTURE TEST page 2 Fournisseur DEMO TTC 1200 MAD) Tj ET
endstream
endobj
9 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 10 0 R/Resources<</Font<</F1 12 0 R>>>>>>endobj
10 0 obj<</Length 70>>stream
BT /F1 12 Tf 72 720 Td (FACTURE TEST page 3 Fournisseur DEMO TTC 1200 MAD) Tj ET
endstream
endobj
12 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 13
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000125 00000 n 
0000000271 00000 n 
0000000391 00000 n 
0000000458 00000 n 
0000000604 00000 n 
0000000724 00000 n 
0000000791 00000 n 
0000000937 00000 n 
0000001057 00000 n 
0000001177 00000 n 
trailer<</Size 13/Root 1 0 R>>
startxref
1255
%%EOF`;

writeFileSync(resolve(dir, 'test-1page.pdf'), onePage);
writeFileSync(resolve(dir, 'test-3page.pdf'), threePage);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
writeFileSync(resolve(dir, 'test-invoice.png'), png);
console.log('fixtures ready in scripts/test-fixtures');

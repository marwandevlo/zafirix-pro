/** Manual visual check: writes sample PDFs and page images to the directory given as argument. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeStudy } from '../../app/lib/business-studio/engine';
import { computeMetrics } from '../../app/lib/business-studio/metrics';
import { newRisk } from '../../app/lib/business-studio/model';
import { buildReport, type ReportType } from '../../app/lib/business-studio/report-model';
import { renderReportPdf } from '../../app/lib/business-studio/report-pdf';
import { richModel } from './fixtures';

async function main() {
  const out = process.argv[2];
  const type = (process.argv[3] ?? 'bank') as ReportType;
  const pages = Number(process.argv[4] ?? 6);
  mkdirSync(out, { recursive: true });
  const fontDir = join(process.cwd(), 'public', 'fonts', 'amiri');
  const fonts = { regular: readFileSync(join(fontDir, 'Amiri-Regular.ttf')).toString('base64'), bold: readFileSync(join(fontDir, 'Amiri-Bold.ttf')).toString('base64') };
  const model = richModel(5);
  model.profile.company.name = 'Société Test SARL';
  model.profile.project.description = 'Magasin de détail à Casablanca.';
  model.risks = [newRisk({ title: 'Retard fournisseur', likelihood: 3, impact: 4, mitigation: 'Double sourcing' })];
  const result = computeStudy(model);
  const metrics = computeMetrics(model, result);
  const { pdf } = await import('pdf-to-img');
  for (const lang of ['fr', 'ar'] as const) {
    const report = buildReport({ type, lang, model, result, metrics, studyName: 'Étude test' });
    const file = join(out, `${type}-${lang}.pdf`);
    writeFileSync(file, Buffer.from(renderReportPdf(report, fonts)));
    let i = 0;
    for await (const page of await pdf(file, { scale: 1.4 })) {
      if (i >= pages) break;
      writeFileSync(join(out, `${type}-${lang}-${i + 1}.png`), page);
      i += 1;
    }
  }
}

void main();

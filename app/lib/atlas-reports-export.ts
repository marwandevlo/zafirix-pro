import type { AtlasReportPayload } from '@/app/types/atlas-reports';

export function reportToCsv(report: AtlasReportPayload): string {
  const lines: string[] = [
    `# Rapport ${report.type}`,
    `# Société: ${report.companyName}`,
    `# Période: ${report.period.periodLabel} (${report.period.periodStart} → ${report.period.periodEnd})`,
    `# Généré: ${new Date(report.generatedAt).toLocaleString('fr-MA')}`,
    '',
  ];

  for (const section of report.sections) {
    lines.push(section.title);
    lines.push(section.headers.map(escapeCsv).join(';'));
    for (const row of section.rows) {
      lines.push(row.map((c) => escapeCsv(String(c))).join(';'));
    }
    lines.push('');
  }

  return lines.join('\n');
}

function escapeCsv(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCsvReport(report: AtlasReportPayload): void {
  const csv = reportToCsv(report);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rapport_${report.type}_${report.period.periodStart}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPdfReport(report: AtlasReportPayload): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  type DocWithAutoTable = InstanceType<typeof jsPDF> & { lastAutoTable?: { finalY: number } };

  const doc = new jsPDF();
  const dateStr = new Date(report.generatedAt).toLocaleDateString('fr-MA');

  doc.setFillColor(15, 31, 61);
  doc.rect(0, 0, 210, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ZAFIRIX PRO', 15, 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(report.companyName, 15, 22);
  doc.text(`Période: ${report.period.periodLabel}`, 15, 28);
  doc.text(`Généré: ${dateStr}`, 120, 28);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const titles: Record<string, string> = {
    commercial: 'Rapport commercial',
    comptable: 'Rapport comptable',
    fiscal: 'Rapport fiscal',
    fournisseurs: 'Rapport fournisseurs',
    clients: 'Rapport clients',
    tva: 'Rapport TVA',
  };
  doc.text(titles[report.type] ?? report.type, 15, 48);

  let startY = 55;
  for (const section of report.sections) {
    if (startY > 250) {
      doc.addPage();
      startY = 20;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(section.title, 15, startY);
    autoTable(doc, {
      startY: startY + 4,
      head: [section.headers],
      body: section.rows,
      headStyles: { fillColor: [15, 31, 61] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      styles: { fontSize: 8 },
      margin: { left: 15, right: 15 },
    });
    startY = ((doc as DocWithAutoTable).lastAutoTable?.finalY ?? startY) + 12;
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(15, 31, 61);
    doc.rect(0, 285, 210, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text('ZAFIRIX PRO — Données réelles Supabase', 15, 292);
    doc.text(`Page ${i}/${pageCount}`, 185, 292);
  }

  doc.save(`rapport_${report.type}_${report.period.periodStart}.pdf`);
}

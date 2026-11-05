import type { Block } from '@/app/lib/business-studio/report-model';

const COLORS = ['#1B2A4A', '#D97706', '#059669', '#BE185D', '#2563EB', '#7C3AED', '#64748B'];

type ChartBlock = Extract<Block, { kind: 'chart' }>;

function seriesValue(block: ChartBlock, value: number) {
  return block.unit === 'mad' ? value / 100 : value;
}

/** Draws one report chart to a PNG. Returns null outside a browser. */
export function chartToPng(block: ChartBlock): Uint8Array | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1B2A4A';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(block.title.slice(0, 90), 24, 32);

  if (block.type === 'donut') drawDonut(ctx, block);
  else if (block.type === 'pyramid') drawBars(ctx, block, true);
  else drawBars(ctx, block, false);

  const url = canvas.toDataURL('image/png');
  const b64 = url.split(',')[1] ?? '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function drawDonut(ctx: CanvasRenderingContext2D, block: ChartBlock) {
  const values = block.series[0]?.values.map((v) => Math.max(0, seriesValue(block, v))) ?? [];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let angle = -Math.PI / 2;
  const cx = 250;
  const cy = 230;
  const r = 120;
  values.forEach((v, i) => {
    const slice = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    angle += slice;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.font = '13px sans-serif';
  block.labels.slice(0, 8).forEach((label, i) => {
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fillRect(500, 80 + i * 28, 14, 14);
    ctx.fillStyle = '#334155';
    ctx.fillText(label.slice(0, 42), 522, 92 + i * 28);
  });
}

function drawBars(ctx: CanvasRenderingContext2D, block: ChartBlock, horizontal: boolean) {
  const values = block.series.flatMap((s) => s.values.map((v) => seriesValue(block, v)));
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const left = 48;
  const top = 56;
  const width = 880;
  const height = 300;
  ctx.strokeStyle = '#CBD5E1';
  ctx.beginPath();
  ctx.moveTo(left, top + height);
  ctx.lineTo(left + width, top + height);
  ctx.stroke();
  const n = Math.max(1, block.labels.length);
  const slot = (horizontal ? height : width) / n;
  block.series.forEach((series, si) => {
    ctx.fillStyle = COLORS[si % COLORS.length];
    series.values.forEach((raw, i) => {
      const v = Math.abs(seriesValue(block, raw)) / max;
      if (horizontal) {
        const y = top + i * slot + 6;
        ctx.fillRect(left, y, Math.max(2, v * width * 0.85), Math.max(4, slot - 12));
      } else {
        const group = slot * 0.8;
        const bar = group / block.series.length;
        const x = left + i * slot + slot * 0.1 + si * bar;
        const h = Math.max(2, v * (height - 8));
        ctx.fillRect(x, top + height - h, Math.max(2, bar - 2), h);
      }
    });
  });
  ctx.fillStyle = '#475569';
  ctx.font = '11px sans-serif';
  const step = Math.max(1, Math.ceil(n / 8));
  block.labels.forEach((label, i) => {
    if (i % step !== 0) return;
    if (horizontal) ctx.fillText(label.slice(0, 28), left + 4, top + i * slot + 18);
    else ctx.fillText(label.slice(0, 10), left + i * slot, top + height + 16);
  });
}

export function chartImagesFor(report: { sections: Array<{ blocks: Block[] }> }): Map<string, Uint8Array> {
  const images = new Map<string, Uint8Array>();
  for (const section of report.sections) {
    for (const block of section.blocks) {
      if (block.kind !== 'chart' || images.has(block.title)) continue;
      const png = chartToPng(block);
      if (png) images.set(block.title, png);
    }
  }
  return images;
}

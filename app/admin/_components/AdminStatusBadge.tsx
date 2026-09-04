const TONE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  credited: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  signed_up: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  activated: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  healthy: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  pending_manual: 'bg-amber-50 text-amber-800 ring-amber-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  degraded: 'bg-amber-50 text-amber-800 ring-amber-200',
  suspended: 'bg-orange-50 text-orange-800 ring-orange-200',
  canceled: 'bg-rose-50 text-rose-800 ring-rose-200',
  cancelled: 'bg-rose-50 text-rose-800 ring-rose-200',
  rejected: 'bg-rose-50 text-rose-800 ring-rose-200',
  banned: 'bg-rose-50 text-rose-800 ring-rose-200',
  error: 'bg-rose-50 text-rose-800 ring-rose-200',
  fail: 'bg-rose-50 text-rose-800 ring-rose-200',
  offline: 'bg-slate-100 text-slate-600 ring-slate-200',
  admin: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  owner: 'bg-[#0F1F3D] text-white ring-[#0F1F3D]',
};

export function AdminStatusBadge({ value, label }: { value?: string | null; label?: string }) {
  const raw = String(value ?? '').trim().toLowerCase();
  const tone = TONE[raw] ?? 'bg-slate-50 text-slate-700 ring-slate-200';
  const text = label ?? (raw ? raw.replace(/_/g, ' ') : '—');
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ${tone}`}>
      {text}
    </span>
  );
}

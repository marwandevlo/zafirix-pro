'use client';

import { createContext, useContext, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Info, Plus, Trash2 } from 'lucide-react';
import { formatCentsMad, formatNumber, formatPercent, STR, type Bi, type Lang, type StrKey } from '@/app/lib/business-studio/i18n';

// ─── Language ────────────────────────────────────────────────────────────────────────────────────

const LANG_KEY = 'zafirix_studio_lang';

type LangCtx = { lang: Lang; setLang: (l: Lang) => void; t: (k: StrKey | Bi) => string; dir: 'ltr' | 'rtl' };
const Ctx = createContext<LangCtx | null>(null);

const LANG_EVENT = 'zafirix-studio-lang';

function subscribeLang(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(LANG_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(LANG_EVENT, cb);
  };
}
const readLang = (): Lang => (window.localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'fr');
const serverLang = (): Lang => 'fr';

/** `lang` pins the language (embedded previews, rendering checks); otherwise the user's saved choice is used. */
export function StudioLangProvider({ children, lang: pinned }: { children: ReactNode; lang?: Lang }) {
  const saved = useSyncExternalStore(subscribeLang, readLang, serverLang);
  const lang = pinned ?? saved;
  const value = useMemo<LangCtx>(() => ({
    lang,
    setLang: (l) => { window.localStorage.setItem(LANG_KEY, l); window.dispatchEvent(new Event(LANG_EVENT)); },
    t: (k) => (typeof k === 'string' ? STR[k][lang] : k[lang]),
    dir: lang === 'ar' ? 'rtl' : 'ltr',
  }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio(): LangCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('StudioLangProvider missing');
  return v;
}

export const bi = (fr: string, ar: string): Bi => ({ fr, ar });

export function LangToggle() {
  const { lang, setLang } = useStudio();
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs" role="group" aria-label="Langue / اللغة">
      {(['fr', 'ar'] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`px-2.5 py-1 rounded-md font-medium ${lang === l ? 'bg-[#1B2A4A] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          {l === 'fr' ? 'FR' : 'العربية'}
        </button>
      ))}
    </div>
  );
}

// ─── Formatting ──────────────────────────────────────────────────────────────────────────────────

export function useFormat() {
  const { lang } = useStudio();
  return useMemo(() => ({
    mad: (cents: number | null | undefined) => (cents == null || !Number.isFinite(cents) ? STR.notAvailable[lang] : formatCentsMad(cents, lang)),
    num: (v: number | null | undefined, digits = 0) => (v == null || !Number.isFinite(v) ? STR.notAvailable[lang] : formatNumber(v, lang, digits)),
    pct: (v: number | null | undefined, digits = 1) => formatPercent(v ?? null, lang, digits),
  }), [lang]);
}

// ─── Layout ──────────────────────────────────────────────────────────────────────────────────────

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          {title && <h3 className="text-sm font-semibold text-gray-800">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'critical' | 'success'; children: ReactNode }) {
  const cls = {
    info: 'bg-slate-50 border-slate-200 text-slate-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    critical: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }[tone];
  return <div role={tone === 'critical' ? 'alert' : 'status'} className={`flex gap-2 items-start rounded-lg border px-3 py-2 text-xs ${cls}`}><Info size={14} className="mt-0.5 shrink-0" aria-hidden /> <div>{children}</div></div>;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-gray-200 scrollbar-thin">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" type="button" aria-selected={value === tab.id} onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${value === tab.id ? 'border-amber-500 text-[#1B2A4A] font-semibold' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'amber' | 'green' | 'blue' | 'red' }) {
  const cls = { gray: 'bg-gray-100 text-gray-700', amber: 'bg-amber-100 text-amber-800', green: 'bg-emerald-100 text-emerald-800', blue: 'bg-blue-100 text-blue-800', red: 'bg-red-100 text-red-800' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function Button({ children, onClick, variant = 'secondary', disabled, type = 'button', title, size = 'md' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; type?: 'button' | 'submit'; title?: string; size?: 'sm' | 'md';
}) {
  const cls = {
    primary: 'bg-[#1B2A4A] text-white hover:bg-[#243660] disabled:bg-gray-300',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400',
    danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50 disabled:text-gray-400',
    ghost: 'text-gray-600 hover:bg-gray-100 disabled:text-gray-300',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} aria-label={title}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${cls}`}>
      {children}
    </button>
  );
}

// ─── Fields ──────────────────────────────────────────────────────────────────────────────────────

type FieldBase = { label: string; help?: string; disabled?: boolean; className?: string };

function FieldShell({ id, label, help, error, children, className = '' }: { id: string; label: string; help?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-gray-600">{label}</label>
      {children}
      {error ? <p id={`${id}-err`} className="text-[11px] text-red-600">{error}</p> : help ? <p id={`${id}-help`} className="text-[11px] text-gray-400">{help}</p> : null}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-gray-50 disabled:text-gray-500 aria-[invalid=true]:border-red-400';

/** Numeric input that keeps the typed text while editing and reports a number only when it parses. */
export function NumField({ label, value, onChange, min, max, step, suffix, help, disabled, nullable, className, integer }: FieldBase & {
  value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; suffix?: string; nullable?: boolean; integer?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (value == null ? '' : String(value));
  const parsed = text.trim() === '' ? null : Number(text.replace(',', '.').replace(/\s/g, ''));
  let error: string | undefined;
  if (parsed != null && !Number.isFinite(parsed)) error = 'Nombre invalide / رقم غير صالح';
  else if (parsed != null && integer && !Number.isInteger(parsed)) error = 'Nombre entier attendu / عدد صحيح';
  else if (parsed != null && min != null && parsed < min) error = `≥ ${min}`;
  else if (parsed != null && max != null && parsed > max) error = `≤ ${max}`;
  return (
    <FieldShell id={id} label={label} help={help} error={error} className={className}>
      <div className="relative">
        <input id={id} inputMode="decimal" disabled={disabled} value={text} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : help ? `${id}-help` : undefined}
          onFocus={() => setDraft(text)}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            setDraft(e.target.value);
            const raw = e.target.value.trim();
            if (raw === '') { if (nullable) onChange(null); return; }
            const n = Number(raw.replace(',', '.').replace(/\s/g, ''));
            if (Number.isFinite(n) && (!integer || Number.isInteger(n)) && (min == null || n >= min) && (max == null || n <= max)) onChange(n);
          }}
          step={step}
          className={`${inputCls} ${suffix ? 'pe-12' : ''} tabular-nums`} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 end-2 flex items-center text-xs text-gray-400">{suffix}</span>}
      </div>
    </FieldShell>
  );
}

export function TextField({ label, value, onChange, help, disabled, className, placeholder, maxLength }: FieldBase & { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} help={help} className={className}>
      <input id={id} value={value} disabled={disabled} placeholder={placeholder} maxLength={maxLength ?? 300} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </FieldShell>
  );
}

export function TextArea({ label, value, onChange, help, disabled, className, rows = 3, maxLength }: FieldBase & { value: string; onChange: (v: string) => void; rows?: number; maxLength?: number }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} help={help} className={className}>
      <textarea id={id} value={value} rows={rows} disabled={disabled} maxLength={maxLength ?? 5000} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </FieldShell>
  );
}

export function SelectField<T extends string | number>({ label, value, onChange, options, help, disabled, className }: FieldBase & {
  value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string }>;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} help={help} className={className}>
      <select id={id} value={String(value)} disabled={disabled} className={inputCls}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        }}>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

export function Toggle({ label, checked, onChange, disabled, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; help?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
        {label}
      </label>
      {help && <p className="text-[11px] text-gray-400">{help}</p>}
    </div>
  );
}

/** Month offset picker over the study calendar; keeps values beyond the horizon visible. */
export function MonthField({ label, value, onChange, labels, disabled, nullable, nullLabel, className }: FieldBase & {
  value: number | null; onChange: (v: number | null) => void; labels: string[]; nullable?: boolean; nullLabel?: string;
}) {
  const { lang } = useStudio();
  const options: Array<{ value: string; label: string }> = [];
  if (nullable) options.push({ value: 'null', label: nullLabel ?? '—' });
  labels.forEach((l, i) => options.push({ value: String(i), label: l }));
  if (value != null && value >= labels.length) options.push({ value: String(value), label: `+${value} (${lang === 'ar' ? 'خارج الأفق' : 'hors horizon'})` });
  const id = useId();
  return (
    <FieldShell id={id} label={label} className={className}>
      <select id={id} disabled={disabled} value={value == null ? 'null' : String(value)} className={inputCls}
        onChange={(e) => onChange(e.target.value === 'null' ? null : Number(e.target.value))}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

/** Editable list of items rendered as cards, with add and remove. */
export function ListEditor<T extends { id: string }>({ items, onChange, create, render, title, disabled, addLabel, emptyLabel }: {
  items: T[]; onChange: (items: T[]) => void; create: () => T; render: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  title: string; disabled?: boolean; addLabel: string; emptyLabel: string;
}) {
  const { t } = useStudio();
  return (
    <Card title={title} actions={<Button size="sm" disabled={disabled} onClick={() => onChange([...items, create()])}><Plus size={14} aria-hidden /> {addLabel}</Button>}>
      {items.length === 0 ? <p className="text-sm text-gray-400">{emptyLabel}</p> : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={item.id} className="rounded-lg border border-gray-200 p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
              </div>
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="danger" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={13} aria-hidden /> {t('remove')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Editable list of short strings (SWOT / PESTEL entries). */
export function StringListEditor({ label, items, onChange, disabled }: { label: string; items: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const { t } = useStudio();
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (v) { onChange([...items, v]); setDraft(''); } };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-700">{label}</p>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li key={`${i}-${s}`} className="flex items-start justify-between gap-2 rounded bg-gray-50 px-2 py-1 text-sm">
            <span>{s}</span>
            <button type="button" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600" aria-label={t('remove')}><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input value={draft} disabled={disabled} maxLength={300} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          aria-label={label} className={inputCls} />
        <Button size="sm" disabled={disabled || !draft.trim()} onClick={add}><Plus size={13} aria-hidden /></Button>
      </div>
    </div>
  );
}

export function KpiCard({ label, value, hint, tone = 'default', title }: { label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'bad' | 'warn'; title?: string }) {
  const color = { default: 'text-[#1B2A4A]', good: 'text-emerald-700', bad: 'text-red-700', warn: 'text-amber-700' }[tone];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm" title={title}>
      <p className="text-[11px] font-medium text-gray-500 leading-tight">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${color}`} dir="ltr">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-gray-400 leading-tight">{hint}</p>}
    </div>
  );
}

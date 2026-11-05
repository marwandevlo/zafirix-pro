'use client';

import { useEffect, useRef, useState } from 'react';
import { applyProposal, completeness, previewImpact, type CopilotMessage, type Proposal } from '@/app/lib/business-studio/copilot';
import type { StudyModel } from '@/app/lib/business-studio/model';
import type { StudyRecord } from '@/app/lib/business-studio/server-store';
import { ApiError, streamCopilot, studioApi, type PublicThread } from './client';
import { bi, Button, useFormat, useStudio } from './ui';

type Props = {
  studyId: string;
  model: StudyModel;
  revision: number;
  readOnly: boolean;
  flush: () => Promise<void>;
  dirty: () => boolean;
  onApplied: (study: StudyRecord) => void;
  onGenerate: () => void;
  onShowStudy: () => void;
};

const PROVENANCE = {
  confirmed: { fr: 'confirmé', ar: 'مؤكد', darija: 'm2akked' },
  estimate: { fr: 'estimation', ar: 'تقدير', darija: 'taqdir' },
  suggestion: { fr: 'suggestion', ar: 'اقتراح', darija: 'iqtira7' },
  unknown: { fr: 'inconnu', ar: 'غير معروف', darija: 'majhoul' },
} as const;

export function CopilotPanel({ studyId, model, revision, readOnly, flush, dirty, onApplied, onGenerate, onShowStudy }: Props) {
  const { t, lang, dir } = useStudio();
  const fmt = useFormat();
  const [thread, setThread] = useState<PublicThread | null>(null);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [impact, setImpact] = useState<ReturnType<typeof previewImpact>>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const chatLang = lang === 'ar' ? 'ar' : 'fr';

  useEffect(() => {
    let gone = false;
    studioApi.copilotGet(studyId).then((next) => { if (!gone) setThread(next); }).catch(() => { if (!gone) setError('load'); });
    return () => { gone = true; abort.current?.abort(); };
  }, [studyId]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [thread, live]);

  const pending: Proposal | null = thread?.pending ?? null;
  const items = completeness(model, pending);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy || !thread) return;
    setBusy(true);
    setError('');
    setLive('');
    setImpact(null);
    setConfirm(false);
    const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await streamCopilot(studyId, { message, clientId, locale: chatLang, threadRevision: thread.threadRevision }, controller.signal);
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new ApiError(res.status, body.error ?? 'copilot_failed', body);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        buf += decoder.decode(step.value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as { type: string; text?: string; error?: string; thread?: PublicThread };
          if (event.type === 'text' && event.text) { acc += event.text; setLive(acc); }
          if (event.type === 'error') throw new ApiError(500, event.error ?? 'copilot_failed', {});
          if (event.type === 'done' && event.thread) {
            setThread(event.thread);
            setSelected((event.thread.pending?.changes ?? []).filter((c) => c.provenance === 'confirmed' || c.provenance === 'estimate').map((c) => c.id));
            setLive('');
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setError('cancelled');
      else setError(e instanceof ApiError ? e.code : 'network_error');
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const apply = async (ids: string[]) => {
    if (!ids.length || !confirm || readOnly) return;
    setBusy(true);
    setError('');
    try {
      await flush();
      if (dirty()) { setError('unsaved'); return; }
      const res = await studioApi.copilotApply(studyId, { confirm: true, revision, changeIds: ids });
      onApplied(res.study);
      setThread(res.thread);
      setSelected([]);
      setConfirm(false);
      setImpact(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network_error');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (readOnly || !thread?.canUndo) return;
    setBusy(true);
    setError('');
    try {
      await flush();
      const res = await studioApi.copilotUndo(studyId, { confirm: true, revision });
      onApplied(res.study);
      setThread(res.thread);
      setImpact(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network_error');
    } finally {
      setBusy(false);
    }
  };

  const showImpact = () => {
    if (!pending) return;
    const ids = selected.length ? selected : pending.changes.map((c) => c.id);
    setImpact(previewImpact(model, applyProposal(model, pending, ids)));
  };

  const label = (m: CopilotMessage) => m.content;
  const missing = items.filter((i) => i.status === 'missing').length;

  return (
    <section className="flex h-full min-h-0 flex-col bg-white" dir={dir} aria-label={t(bi('Assistant d’étude', 'مساعد الدراسة'))}>
      <header className="shrink-0 border-b-4 border-[#F4B544] bg-[#142B55] px-3 py-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t(bi('Consultant d’étude', 'مستشار الدراسة'))}</h2>
          <button type="button" className="rounded-md bg-white/15 px-2 py-1 text-[11px] lg:hidden" onClick={onShowStudy}>{t(bi('Voir l’étude', 'عرض الدراسة'))}</button>
        </div>
        <p className="mt-1 text-[11px] text-slate-200">
          {t(bi('Les totaux viennent du moteur. Une suggestion n’est enregistrée qu’après votre confirmation.', 'المجاميع من المحرك. لا يُحفظ اقتراح إلا بعد تأكيدك.'))}
        </p>
        <p className="mt-1 text-[11px] text-[#C7F4EF]">{t(bi(`${missing} élément(s) encore ouvert(s)`, `${missing} عنصر لا يزال مفتوحاً`))}</p>
      </header>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
        {(thread?.messages ?? []).map((m) => (
          <article key={m.id} dir="auto" className={`max-w-[95%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'ml-auto bg-[#176BCE] text-white' : 'mr-auto border border-[#D7F3F0] bg-[#F8FAFC] text-[#142B55]'}`}>
            {label(m)}
          </article>
        ))}
        {live && <article dir="auto" className="mr-auto max-w-[95%] whitespace-pre-wrap rounded-2xl border border-[#D7F3F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#142B55]">{live}</article>}
        {!thread && <p className="text-xs text-slate-500">{t(bi('Chargement de la conversation…', 'جارٍ تحميل الحوار…'))}</p>}
      </div>
      {pending && pending.changes.length > 0 && (
        <div className="max-h-[34%] shrink-0 space-y-2 overflow-y-auto border-t border-slate-200 px-3 py-2">
          <p className="text-xs font-semibold text-[#142B55]">{t(bi('Relecture avant enregistrement', 'مراجعة قبل الحفظ'))}</p>
          {pending.changes.map((c) => (
            <label key={c.id} className="flex items-start gap-2 text-xs text-[#142B55]">
              <input type="checkbox" className="mt-0.5" checked={selected.includes(c.id)} onChange={(e) => setSelected((cur) => e.target.checked ? [...cur, c.id] : cur.filter((id) => id !== c.id))} />
              <span>
                <span className="font-semibold">{c.label[chatLang === 'ar' ? 'ar' : 'fr']}</span>
                <span className="ml-1 rounded bg-[#F3EEFF] px-1.5 py-0.5 text-[10px] font-medium text-[#4C1D95]">{PROVENANCE[c.provenance][chatLang === 'ar' ? 'ar' : 'fr']}</span>
                <span className="mt-0.5 block text-slate-600">{c.before} → {c.after}</span>
              </span>
            </label>
          ))}
          <label className="flex items-start gap-2 text-xs text-[#142B55]">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            {t(bi('J’ai relu ces hypothèses et je confirme leur enregistrement.', 'راجعت هذه الفرضيات وأؤكد حفظها.'))}
          </label>
          {impact && (
            <p className="rounded-lg bg-[#F8FAFC] p-2 text-[11px] text-[#142B55]">
              {t(bi('Impact simulé, non enregistré.', 'أثر محاكى وغير محفوظ.'))} {t(bi('CA', 'رقم المعاملات'))} {fmt.mad(impact.revenue[0])} → {fmt.mad(impact.revenue[1])}. VAN {fmt.mad(impact.npv[0])} → {fmt.mad(impact.npv[1])}.
            </p>
          )}
        </div>
      )}
      {error && <p role="alert" className="px-3 text-xs text-red-700">{error}</p>}
      <form className="shrink-0 space-y-2 border-t border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); void send(draft).then(() => setDraft('')); }}>
        <label className="sr-only" htmlFor="copilot-input">{t(bi('Message', 'رسالة'))}</label>
        <textarea id="copilot-input" dir="auto" value={draft} maxLength={4000} rows={3} disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t(bi('Décrivez le projet. Arabe, darija ou français.', 'صف المشروع بالعربية أو الدارجة أو الفرنسية.'))}
          className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-[#142B55] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#176BCE]" />
        <div className="flex flex-wrap gap-1.5">
          <Button type="submit" variant="primary" size="sm" disabled={busy || !draft.trim()}>{t(bi('Envoyer', 'إرسال'))}</Button>
          <Button size="sm" variant="ghost" disabled={!busy} onClick={() => abort.current?.abort()}>{t(bi('Annuler', 'إلغاء'))}</Button>
          <Button size="sm" disabled={busy || readOnly || !confirm || selected.length === 0} onClick={() => void apply(selected)}>{t(bi('Appliquer la sélection', 'تطبيق الاختيار'))}</Button>
          <Button size="sm" disabled={busy || readOnly || !pending} onClick={() => { const ids = pending?.changes.filter((c) => c.provenance === 'suggestion').map((c) => c.id) ?? []; setSelected(ids); }}>{t(bi('Voir les suggestions', 'عرض الاقتراحات'))}</Button>
          <Button size="sm" disabled={busy || readOnly || !confirm || !pending?.changes.some((c) => c.provenance === 'suggestion')} onClick={() => void apply(pending?.changes.filter((c) => c.provenance === 'suggestion').map((c) => c.id) ?? [])}>{t(bi('Appliquer les suggestions', 'تطبيق الاقتراحات'))}</Button>
          <Button size="sm" variant="ghost" disabled={busy || readOnly || !thread?.canUndo} onClick={() => void undo()}>{t(bi('Annuler la dernière application', 'التراجع عن آخر تطبيق'))}</Button>
          <Button size="sm" variant="ghost" disabled={!pending} onClick={showImpact}>{t(bi('Voir l’impact financier', 'عرض الأثر المالي'))}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send(lang === 'ar' ? 'كمل' : 'Continuer l’entretien')}>{t(bi('Continuer l’entretien', 'متابعة المقابلة'))}</Button>
          <Button size="sm" variant="ghost" onClick={onGenerate}>{t(bi('Générer le rapport', 'إنشاء التقرير'))}</Button>
        </div>
      </form>
    </section>
  );
}

export function StudyProgress({ model }: { model: StudyModel }) {
  const { t, lang } = useStudio();
  const items = completeness(model, null);
  const done = items.filter((i) => i.status === 'confirmed').length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2" aria-label={t(bi('Avancement de l’étude', 'تقدم الدراسة'))}>
      <div className="mb-1 flex items-center justify-between text-[11px] text-[#142B55]">
        <span className="font-semibold">{t(bi('Avancement', 'التقدم'))}</span>
        <span>{done}/{items.length}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-slate-100">
        <div className="h-full bg-[#00AFA0]" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <ul className="mt-2 flex gap-1 overflow-x-auto">
        {items.map((item) => (
          <li key={item.id} className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${item.status === 'confirmed' ? 'bg-[#E6F7F6] text-[#0F766E]' : item.status === 'unverified' ? 'bg-[#F3EEFF] text-[#4C1D95]' : 'bg-slate-100 text-slate-600'}`}>
            {item.label[lang === 'ar' ? 'ar' : 'fr']}
          </li>
        ))}
      </ul>
    </div>
  );
}

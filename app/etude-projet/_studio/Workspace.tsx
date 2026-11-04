'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { buildCalendar, computeStudy, type StudyResult } from '@/app/lib/business-studio/engine';
import { computeMetrics, type StudyMetrics } from '@/app/lib/business-studio/metrics';
import { validateStudyModel, type StudyModel, type ValidationIssue } from '@/app/lib/business-studio/model';
import { scenarioText, STR } from '@/app/lib/business-studio/i18n';
import { SHARING_MODES, type Sharing } from '@/app/lib/business-studio/model';
import type { StatusAction, StudyRecord } from '@/app/lib/business-studio/server-store';
import { Actuals } from './Actuals';
import { Assumptions } from './Assumptions';
import { ApiError, studioApi } from './client';
import { Dashboard } from './Dashboard';
import { Profile } from './Profile';
import { Reports } from './Reports';
import { Risks } from './Risks';
import { Scenarios } from './Scenarios';
import { Simulator } from './Simulator';
import { Statements } from './Statements';
import { Tax } from './Tax';
import { Versions } from './Versions';
import { Badge, bi, Button, LangToggle, Notice, Tabs, useStudio } from './ui';

type Tab = 'dashboard' | 'profile' | 'assumptions' | 'statements' | 'tax' | 'simulator' | 'scenarios' | 'risks' | 'actuals' | 'reports' | 'versions';
type SaveState = 'saved' | 'dirty' | 'saving' | 'invalid' | 'conflict' | 'error';

const STATUS_TONE = { draft: 'gray', under_review: 'amber', approved: 'green', archived: 'blue' } as const;
const AUTOSAVE_MS = 1500;
const RETRY_MS = 8000;

function compute(model: StudyModel, scenarioId: string): { r: StudyResult; x: StudyMetrics } | null {
  try {
    const r = computeStudy(model, scenarioId);
    return { r, x: computeMetrics(model, r) };
  } catch {
    return null;
  }
}

export function Workspace({ studyId }: { studyId: string }) {
  const { t, lang } = useStudio();
  const router = useRouter();
  const [study, setStudy] = useState<StudyRecord | null>(null);
  const [loadError, setLoadError] = useState('');
  const [model, setModel] = useState<StudyModel | null>(null);
  const [validModel, setValidModel] = useState<StudyModel | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [name, setName] = useState('');
  const [save, setSave] = useState<SaveState>('saved');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [viewScenario, setViewScenario] = useState<string | null>(null);

  const latest = useRef<{ model: StudyModel | null; name: string }>({ model: null, name: '' });
  const revision = useRef(0);
  const dirty = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocked = useRef(false);

  const accept = useCallback((s: StudyRecord) => {
    setStudy(s);
    setName(s.name);
    setModel(s.meta.model);
    const v = validateStudyModel(s.meta.model);
    setIssues(v.issues);
    setValidModel(v.ok ? v.model : null);
    latest.current = { model: s.meta.model, name: s.name };
    revision.current = s.meta.revision;
    dirty.current = false;
    blocked.current = false;
    setSave('saved');
  }, []);

  const load = useCallback(async () => {
    setLoadError('');
    try { accept(await studioApi.get(studyId)); } catch (e) { setLoadError(e instanceof ApiError ? e.code : 'network_error'); }
  }, [accept, studyId]);

  useEffect(() => { void load(); }, [load]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inflight.current) { await inflight.current; }
    if (!dirty.current || blocked.current || !latest.current.model) return;
    const snapshot = latest.current;
    const v = validateStudyModel(snapshot.model);
    if (!v.ok) { setSave('invalid'); return; }
    dirty.current = false;
    setSave('saving');
    const run = (async () => {
      try {
        const s = await studioApi.save(studyId, { model: snapshot.model!, name: snapshot.name, revision: revision.current });
        revision.current = s.meta.revision;
        setStudy(s);
        setSave(dirty.current ? 'dirty' : 'saved');
      } catch (e) {
        dirty.current = true;
        if (e instanceof ApiError && e.code === 'revision_conflict') { blocked.current = true; setSave('conflict'); }
        else if (e instanceof ApiError && e.code === 'study_locked') { blocked.current = true; setSave('conflict'); }
        else if (e instanceof ApiError && e.status === 422) { setIssues(e.issues); setSave('invalid'); }
        else {
          setSave('error');
          timer.current = setTimeout(() => { void flushRef.current(); }, RETRY_MS);
        }
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
    if (dirty.current && !blocked.current && !timer.current) timer.current = setTimeout(() => { void flushRef.current(); }, AUTOSAVE_MS);
  }, [studyId]);

  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  const schedule = () => {
    dirty.current = true;
    if (blocked.current) return;
    setSave('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flushRef.current(); }, AUTOSAVE_MS);
  };

  const edit = (m: StudyModel) => {
    setModel(m);
    const v = validateStudyModel(m);
    setIssues(v.issues);
    if (v.ok) setValidModel(v.model);
    latest.current = { ...latest.current, model: m };
    schedule();
  };
  const rename = (n: string) => {
    setName(n);
    latest.current = { ...latest.current, name: n };
    schedule();
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current || inflight.current) { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const status = study?.meta.studyStatus ?? 'draft';
  const access = study?.access.level ?? 'owner';
  const readOnly = access === 'read';
  const locked = status === 'approved' || status === 'archived' || readOnly;
  const disabled = locked || save === 'conflict';
  const scenarioId = (locked ? viewScenario : null) ?? model?.activeScenarioId ?? 'base';
  const deferredValid = useDeferredValue(validModel);
  const computed = useMemo(() => (deferredValid ? compute(deferredValid, scenarioId) : null), [deferredValid, scenarioId]);
  const monthLabels = useMemo(() => {
    if (!model) return [];
    try { return buildCalendar(model.horizon.startMonth, model.horizon.years, model.horizon.fiscalYearStartMonth).labels; } catch { return computed?.r.calendar.labels ?? []; }
  }, [model, computed]);

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError('');
    try {
      await flush();
      if (dirty.current) { setActionError(t(bi('Enregistrez d’abord les modifications (corrigez les erreurs éventuelles).', 'احفظ التعديلات أولاً (صحح الأخطاء إن وجدت).'))); return; }
      await fn();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const errorText = (e: unknown) => {
    if (!(e instanceof ApiError)) return 'network_error';
    const key = `err_${e.code}`;
    return key in STR ? t(key as keyof typeof STR) : e.code;
  };
  const changeStatus = (action: StatusAction) => runAction(async () => {
    accept(await studioApi.status(studyId, action, revision.current));
    setViewScenario(null);
  });
  const changeSharing = (sharing: Sharing) => runAction(async () => {
    accept(await studioApi.share(studyId, sharing, revision.current));
  });
  const duplicate = () => runAction(async () => {
    const s = await studioApi.duplicate(studyId, `${name} — ${t(bi('copie', 'نسخة'))}`);
    router.push(`/etude-projet/${s.id}`);
  });
  const saveLocalAsNew = () => runActionUnsafe(async () => {
    if (!latest.current.model) return;
    const s = await studioApi.create({ name: `${name} — ${t(bi('copie locale', 'نسخة محلية'))}`, companyId: study?.companyId ?? null, model: latest.current.model });
    dirty.current = false;
    router.push(`/etude-projet/${s.id}`);
  });
  const runActionUnsafe = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError('');
    try { await fn(); } catch (e) { setActionError(errorText(e)); } finally { setBusy(false); }
  };
  const statusText = study?.meta.studyStatus === 'approved'
    ? t(study.meta.approval?.independent ? 'st_approved_independent' : 'st_approved_self')
    : t(`st_${status}` as const);

  if (loadError) {
    return (
      <div className="p-6 space-y-3">
        <Notice tone="critical">{loadError === 'not_found' ? t(bi('Étude introuvable ou accès refusé.', 'الدراسة غير موجودة أو الولوج مرفوض.')) : `${t(bi('Chargement impossible', 'تعذر التحميل'))} (${loadError})`}</Notice>
        <Link href="/etude-projet" className="text-sm text-blue-700 underline">{t('studies')}</Link>
      </div>
    );
  }
  if (!study || !model) return <div className="p-6 text-sm text-gray-500">{t('loading')}</div>;

  const errors = issues.filter((i) => i.severity === 'error');
  const saveLabel: Record<SaveState, string> = {
    saved: t('saved'), dirty: t('unsaved'), saving: t('saving'), invalid: t('validationErrors'), conflict: t('conflict'), error: t(bi('Échec, nouvel essai…', 'فشل، إعادة المحاولة…')),
  };
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: t('tab_dashboard') }, { id: 'profile', label: t('tab_profile') }, { id: 'assumptions', label: t('tab_assumptions') },
    { id: 'statements', label: t('tab_statements') }, { id: 'tax', label: t('tab_tax') }, { id: 'simulator', label: t('tab_simulator') },
    { id: 'scenarios', label: t('tab_scenarios') }, { id: 'risks', label: t('tab_risks') }, { id: 'actuals', label: t('tab_actuals') },
    { id: 'reports', label: t('tab_reports') }, { id: 'versions', label: t('tab_versions') },
  ];
  const needsResult = tab !== 'profile' && tab !== 'assumptions' && tab !== 'versions';

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 space-y-2 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/etude-projet" className="text-xs text-gray-500 hover:text-gray-800">← {t('studies')}</Link>
          <input aria-label={t('name')} dir="auto" value={name} disabled={disabled} maxLength={200} onChange={(e) => rename(e.target.value)}
            className="flex-1 min-w-[180px] text-lg font-bold text-gray-800 bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none disabled:text-gray-600" />
          <Badge tone={STATUS_TONE[status]}>{statusText}</Badge>
          <span role="status" aria-live="polite" className={`text-xs ${save === 'saved' ? 'text-green-700' : save === 'conflict' || save === 'invalid' || save === 'error' ? 'text-red-700' : 'text-gray-500'}`}>
            {saveLabel[save]} · {t('revision')} {study.meta.revision}
          </span>
          <LangToggle />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-600 flex items-center gap-1.5">
            {t('scenario')}
            <select value={scenarioId} className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
              onChange={(e) => (locked ? setViewScenario(e.target.value) : edit({ ...model, activeScenarioId: e.target.value }))}>
              {model.scenarios.map((s) => <option key={s.id} value={s.id}>{scenarioText(s.name, lang)}</option>)}
            </select>
          </label>
          {access === 'owner' && study.companyId && (
            <label className="text-xs text-gray-600 flex items-center gap-1.5">
              {t('sharing')}
              <select value={study.meta.sharing} disabled={busy} className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                onChange={(e) => void changeSharing(e.target.value as Sharing)}>
                {SHARING_MODES.map((s) => <option key={s} value={s}>{t(`share_${s}` as const)}</option>)}
              </select>
            </label>
          )}
          <span className="flex-1" />
          {status === 'draft' && !readOnly && <Button size="sm" disabled={busy} onClick={() => void changeStatus('submit')}>{t('submit')}</Button>}
          {status === 'under_review' && (access === 'owner' || study.access.canApprove) && (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void changeStatus('approve')}>{access === 'owner' ? t('approveSelf') : t('approve')}</Button>
          )}
          {(status === 'under_review' || status === 'approved') && !readOnly && <Button size="sm" disabled={busy} onClick={() => void changeStatus('reopen')}>{t('reopen')}</Button>}
          {status !== 'archived' && access === 'owner' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void changeStatus('archive')}>{t('archive')}</Button>}
          {status === 'archived' && access === 'owner' && <Button size="sm" disabled={busy} onClick={() => void changeStatus('restore')}>{t('restore')}</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void duplicate()}>{t('duplicate')}</Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
        {save === 'conflict' && (
          <Notice tone="critical">
            <div className="space-y-2">
              <p>{t(bi('L’étude a été modifiée ailleurs (autre onglet ou utilisateur) ou verrouillée. Vos dernières modifications ne sont pas enregistrées.', 'تم تعديل الدراسة في مكان آخر (علامة تبويب أو مستخدم آخر) أو تم قفلها. تعديلاتك الأخيرة غير محفوظة.'))}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={busy} onClick={() => void load()}>{t('reload')}</Button>
                <Button size="sm" disabled={busy} onClick={() => void saveLocalAsNew()}>{t(bi('Enregistrer mes modifications comme nouvelle étude', 'حفظ تعديلاتي كدراسة جديدة'))}</Button>
              </div>
            </div>
          </Notice>
        )}
        {readOnly && <Notice tone="info">{t('sharedReadOnly')}</Notice>}
        {access === 'edit' && <Notice tone="info">{t('sharedEdit')}</Notice>}
        {locked && !readOnly && <Notice tone="info">{t('locked')}</Notice>}
        {status === 'approved' && !study.meta.approval?.independent && <Notice tone="warning">{t('selfApprovalWarning')}</Notice>}
        {actionError && <Notice tone="critical">{actionError}</Notice>}
        {errors.length > 0 && (
          <Notice tone="warning">
            {t(bi(`${errors.length} erreur(s) de saisie : l’enregistrement est suspendu et les résultats affichés sont ceux de la dernière saisie valide.`, `${errors.length} خطأ في الإدخال: الحفظ معلق والنتائج المعروضة هي نتائج آخر إدخال صالح.`))}
          </Notice>
        )}
        <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('appTitle')} />
        <div role="tabpanel" aria-label={tabs.find((x) => x.id === tab)?.label} className="pt-1">
          {needsResult && !computed ? (
            <Notice tone="warning">{t(bi('Aucun résultat calculable : complétez ou corrigez les hypothèses.', 'لا توجد نتائج قابلة للحساب: أكمل الفرضيات أو صححها.'))}</Notice>
          ) : (<>
            {tab === 'dashboard' && computed && <Dashboard model={deferredValid!} r={computed.r} x={computed.x} />}
            {tab === 'profile' && <Profile model={model} onChange={edit} disabled={disabled} />}
            {tab === 'assumptions' && <Assumptions model={model} onChange={edit} disabled={disabled} labels={monthLabels} issues={issues} />}
            {tab === 'statements' && computed && <Statements r={computed.r} />}
            {tab === 'tax' && computed && <Tax r={computed.r} />}
            {tab === 'simulator' && computed && <Simulator model={model} r={computed.r} x={computed.x} onChange={edit} disabled={disabled} />}
            {tab === 'scenarios' && computed && <Scenarios model={model} r={computed.r} onChange={edit} disabled={disabled} />}
            {tab === 'risks' && computed && <Risks model={model} r={computed.r} x={computed.x} onChange={edit} disabled={disabled} />}
            {tab === 'actuals' && computed && <Actuals studyId={studyId} r={computed.r} hasCompany={Boolean(study.companyId)} />}
            {tab === 'reports' && computed && (
              <Reports studyId={studyId} studyName={name} model={deferredValid!} r={computed.r} x={computed.x} revision={study.meta.revision}
                status={status === 'approved' ? (study.meta.approval?.independent ? 'approved_independent' : 'approved_self') : status} hasCompany={Boolean(study.companyId)} unsaved={save !== 'saved'} />
            )}
            {tab === 'versions' && computed && (
              <Versions study={study} model={model} x={computed.x} unsaved={save !== 'saved'} locked={disabled} onRestored={accept} />
            )}
            {tab === 'versions' && !computed && <Notice tone="warning">{t('validationErrors')}</Notice>}
          </>)}
        </div>
        <p className="text-[10px] text-gray-500 pt-4" dir="ltr">
          {computed ? `${computed.r.engineVersion} · ${computed.r.rulesVersion}` : ''} · {lang.toUpperCase()}
        </p>
      </div>
    </div>
  );
}

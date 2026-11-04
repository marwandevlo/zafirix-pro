'use client';

import { useState } from 'react';
import { newId, type StudyModel } from '@/app/lib/business-studio/model';
import { LegalFormSelect } from './Assumptions';
import { bi, Button, Card, ListEditor, Notice, NumField, TextArea, TextField, Toggle, useStudio } from './ui';

const MAX_LOGO_CHARS = 400_000;

export function Profile({ model, onChange, disabled }: { model: StudyModel; onChange: (m: StudyModel) => void; disabled: boolean }) {
  const { t } = useStudio();
  const [logoError, setLogoError] = useState('');
  const pr = model.profile;
  const c = pr.company;
  const setCompany = (patch: Partial<typeof c>) => onChange({ ...model, profile: { ...pr, company: { ...c, ...patch } } });
  const setProject = (patch: Partial<typeof pr.project>) => onChange({ ...model, profile: { ...pr, project: { ...pr.project, ...patch } } });
  const setNarrative = (patch: Partial<typeof model.narrative>) => onChange({ ...model, narrative: { ...model.narrative, ...patch } });

  const onLogo = (file: File | undefined) => {
    setLogoError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setLogoError(t(bi('Format accepté : PNG ou JPEG.', 'الصيغ المقبولة: PNG أو JPEG.'))); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      if (url.length > MAX_LOGO_CHARS) { setLogoError(t(bi('Logo trop volumineux (max. ~290 Ko).', 'الشعار كبير جداً (حوالي 290 كيلوبايت كحد أقصى).'))); return; }
      setCompany({ logoDataUrl: url });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <Notice>{t(bi('Les identifiants (ICE, RC, IF, CNSS) sont facultatifs et ne concernent que les entreprises immatriculées. Aucune donnée personnelle sensible (CIN, date de naissance…) n’est demandée.', 'المعرفات (ICE وRC وIF وCNSS) اختيارية وتخص المقاولات المسجلة فقط. لا تُطلب أي معطيات شخصية حساسة.'))}</Notice>
      <Card title={t(bi('Entreprise', 'المقاولة'))}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <TextField label={t(bi('Raison sociale / nom du projet', 'الاسم التجاري / اسم المشروع'))} value={c.name} disabled={disabled} onChange={(v) => setCompany({ name: v })} />
          <TextField label={t(bi('Nom commercial', 'الاسم التجاري المستعمل'))} value={c.tradingName} disabled={disabled} onChange={(v) => setCompany({ tradingName: v })} />
          <LegalFormSelect value={c.legalForm} disabled={disabled} onChange={(v) => setCompany({ legalForm: v })} />
          <TextField label={t(bi('Activité', 'النشاط'))} value={c.activity} disabled={disabled} onChange={(v) => setCompany({ activity: v })} />
          <TextField label={t(bi('Ville', 'المدينة'))} value={c.city} disabled={disabled} onChange={(v) => setCompany({ city: v })} />
          <TextField label={t(bi('Adresse', 'العنوان'))} value={c.address} disabled={disabled} onChange={(v) => setCompany({ address: v })} />
          <TextField label={t(bi('Téléphone', 'الهاتف'))} value={c.phone} disabled={disabled} onChange={(v) => setCompany({ phone: v })} />
          <TextField label={t(bi('E-mail', 'البريد الإلكتروني'))} value={c.email} disabled={disabled} onChange={(v) => setCompany({ email: v })} />
          <Toggle label={t(bi('Entreprise déjà immatriculée', 'مقاولة مسجلة'))} checked={c.incorporated} disabled={disabled} onChange={(v) => setCompany({ incorporated: v })} />
          {c.incorporated && (<>
            <TextField label="ICE" value={c.ice} maxLength={15} disabled={disabled} onChange={(v) => setCompany({ ice: v.replace(/\D/g, '') })} help={t(bi('15 chiffres', '15 رقماً'))} />
            <TextField label="RC" value={c.rc} disabled={disabled} onChange={(v) => setCompany({ rc: v })} />
            <TextField label="IF" value={c.if} disabled={disabled} onChange={(v) => setCompany({ if: v })} />
            <TextField label="CNSS" value={c.cnss} disabled={disabled} onChange={(v) => setCompany({ cnss: v })} />
            <div className="flex flex-col gap-1">
              <label htmlFor="inc-date" className="text-xs font-medium text-gray-600">{t(bi('Date d’immatriculation', 'تاريخ التسجيل'))}</label>
              <input id="inc-date" type="date" disabled={disabled} value={c.incorporationDate} onChange={(e) => setCompany({ incorporationDate: e.target.value })} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </div>
          </>)}
          <div className="flex flex-col gap-1">
            <label htmlFor="logo" className="text-xs font-medium text-gray-600">{t(bi('Logo (PNG/JPEG)', 'الشعار (PNG/JPEG)'))}</label>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview, nothing to optimise */}
              {c.logoDataUrl && <img src={c.logoDataUrl} alt="" className="h-10 w-10 rounded border object-contain" />}
              <input id="logo" type="file" accept="image/png,image/jpeg" disabled={disabled} onChange={(e) => onLogo(e.target.files?.[0])} className="text-xs" />
              {c.logoDataUrl && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setCompany({ logoDataUrl: '' })}>{t('remove')}</Button>}
            </div>
            {logoError && <p className="text-[11px] text-red-600">{logoError}</p>}
          </div>
        </div>
      </Card>
      <ListEditor title={t(bi('Dirigeants', 'المسيرون'))} items={pr.directors} disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        onChange={(v) => onChange({ ...model, profile: { ...pr, directors: v } })}
        create={() => ({ id: newId('dir'), name: '', position: '', history: '', qualifications: '', experienceYears: 0 })}
        render={(d, u) => (<>
          <TextField label={t('name')} value={d.name} disabled={disabled} onChange={(v) => u({ name: v })} />
          <TextField label={t(bi('Fonction', 'المنصب'))} value={d.position} disabled={disabled} onChange={(v) => u({ position: v })} />
          <NumField label={t(bi('Années d’expérience', 'سنوات الخبرة'))} integer value={d.experienceYears} min={0} max={80} disabled={disabled} onChange={(v) => v != null && u({ experienceYears: v })} />
          <TextField label={t(bi('Qualifications', 'المؤهلات'))} value={d.qualifications} disabled={disabled} onChange={(v) => u({ qualifications: v })} />
          <TextArea className="sm:col-span-2 lg:col-span-4" label={t(bi('Parcours professionnel', 'المسار المهني'))} value={d.history} rows={2} disabled={disabled} onChange={(v) => u({ history: v })} />
        </>)} />
      <ListEditor title={t(bi('Associés et actionnaires', 'الشركاء والمساهمون'))} items={pr.shareholders} disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        onChange={(v) => onChange({ ...model, profile: { ...pr, shareholders: v } })}
        create={() => ({ id: newId('shr'), name: '', ownershipPct: 0, contribution: 0, commitment: '' })}
        render={(s, u) => (<>
          <TextField label={t('name')} value={s.name} disabled={disabled} onChange={(v) => u({ name: v })} />
          <NumField label={t(bi('Part du capital', 'الحصة من الرأسمال'))} suffix="%" value={s.ownershipPct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && u({ ownershipPct: v })} />
          <NumField label={t(bi('Apport (MAD)', 'المساهمة (درهم)'))} value={s.contribution} min={0} disabled={disabled} onChange={(v) => v != null && u({ contribution: v })} />
          <TextField label={t(bi('Engagement', 'الالتزام'))} value={s.commitment} disabled={disabled} onChange={(v) => u({ commitment: v })} />
        </>)} />
      <Card title={t(bi('Projet', 'المشروع'))}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <TextField label={t(bi('Localisation', 'الموقع'))} value={pr.project.location} disabled={disabled} onChange={(v) => setProject({ location: v })} />
          <TextArea label={t(bi('Description', 'الوصف'))} value={pr.project.description} disabled={disabled} onChange={(v) => setProject({ description: v })} />
          <TextArea label={t(bi('Objectifs', 'الأهداف'))} value={pr.project.objectives} disabled={disabled} onChange={(v) => setProject({ objectives: v })} />
          <TextArea label={t(bi('Modèle économique', 'النموذج الاقتصادي'))} value={pr.project.businessModel} disabled={disabled} onChange={(v) => setProject({ businessModel: v })} />
          <TextArea label={t(bi('Marché', 'السوق'))} value={pr.project.market} disabled={disabled} onChange={(v) => setProject({ market: v })} help={t(bi('Citez vos sources : l’outil ne fournit aucune statistique de marché.', 'اذكر مصادرك: لا يقدم البرنامج أي إحصائيات عن السوق.'))} />
          <TextArea label={t(bi('Clientèle cible', 'الزبناء المستهدفون'))} value={pr.project.targetCustomers} disabled={disabled} onChange={(v) => setProject({ targetCustomers: v })} />
          <TextArea label={t(bi('Concurrence', 'المنافسة'))} value={pr.project.competition} disabled={disabled} onChange={(v) => setProject({ competition: v })} />
        </div>
      </Card>
      <Card title={t(bi('Textes du rapport (rédigés par vous)', 'نصوص التقرير (تحررها أنت)'))}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <TextArea label={t(bi('Synthèse', 'ملخص'))} value={model.narrative.executiveSummary} rows={5} disabled={disabled} onChange={(v) => setNarrative({ executiveSummary: v })} />
          <TextArea label={t(bi('Analyse de marché', 'تحليل السوق'))} value={model.narrative.marketAnalysis} rows={5} disabled={disabled} onChange={(v) => setNarrative({ marketAnalysis: v })} />
          <TextArea label={t(bi('Conclusion', 'خلاصة'))} value={model.narrative.conclusion} rows={5} disabled={disabled} onChange={(v) => setNarrative({ conclusion: v })} />
        </div>
      </Card>
    </div>
  );
}

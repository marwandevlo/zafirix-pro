-- Juridique module: dynamic Moroccan legal categories & document types (admin-managed)

create table if not exists public.atlas_juridique_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  label_fr text not null,
  label_ar text not null,
  description_fr text,
  description_ar text,
  upload_prompt_fr text,
  upload_prompt_ar text,
  icon text not null default 'folder',
  sort_order integer not null default 0,
  is_system boolean not null default false,
  is_active boolean not null default true,
  document_types_filter text[] not null default '{}',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_juridique_categories_slug_len check (char_length(slug) >= 2 and char_length(slug) <= 64)
);

create unique index if not exists atlas_juridique_categories_slug_key
  on public.atlas_juridique_categories (lower(slug));

create table if not exists public.atlas_juridique_document_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.atlas_juridique_categories (id) on delete cascade,
  slug text not null,
  label_fr text not null,
  label_ar text not null,
  description_fr text,
  description_ar text,
  upload_prompt_fr text,
  upload_prompt_ar text,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  fields jsonb not null default '[]'::jsonb,
  moroccan_ref text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_juridique_document_types_slug_len check (char_length(slug) >= 2 and char_length(slug) <= 64)
);

create unique index if not exists atlas_juridique_document_types_cat_slug_key
  on public.atlas_juridique_document_types (category_id, lower(slug));

create index if not exists atlas_juridique_document_types_category_idx
  on public.atlas_juridique_document_types (category_id, sort_order);

alter table public.atlas_juridique_categories enable row level security;
alter table public.atlas_juridique_document_types enable row level security;

-- Authenticated users can read active catalog rows
drop policy if exists atlas_juridique_categories_select on public.atlas_juridique_categories;
create policy atlas_juridique_categories_select on public.atlas_juridique_categories
  for select to authenticated using (is_active = true);

drop policy if exists atlas_juridique_document_types_select on public.atlas_juridique_document_types;
create policy atlas_juridique_document_types_select on public.atlas_juridique_document_types
  for select to authenticated using (is_active = true);

-- Seed Moroccan corporate legal structure (idempotent via slug)
insert into public.atlas_juridique_categories (slug, label_fr, label_ar, description_fr, description_ar, upload_prompt_fr, upload_prompt_ar, icon, sort_order, is_system, document_types_filter, tags)
values
  ('registre_commerce', 'Registre de Commerce (RC)', 'السجل التجاري', 'Immatriculation, extrait RC, Kbis, certificat négatif', 'التسجيل في السجل التجاري، مقتطف RC، شهادة سلبية', 'Déposez votre extrait RC, Kbis ou certificat négatif (Tribunal de Commerce).', 'ارفع مقتطف السجل التجاري أو Kbis أو الشهادة السلبية.', 'landmark', 10, true, array['juridique','legal_contract','company_statutes'], array['rc','kbis','registre','commerce','tribunal']),
  ('patente', 'Patente', 'الضريبة المهنية', 'Taxe professionnelle, quittance patente communale', 'الضريبة المهنية ووصولات الأداء', 'Téléversez votre quittance ou attestation de patente (commune).', 'ارفع وصل أو شهادة الضريبة المهنية (الجماعة).', 'receipt', 20, true, array['tax_declaration','juridique'], array['patente','commune','taxe','professionnelle']),
  ('identifiant_fiscal', 'Identifiant Fiscal (IF)', 'المعرف الضريبي', 'Attestation IF, inscription DGI, situation fiscale', 'شهادة المعرف الضريبي وتسجيل المديرية العامة للضرائب', 'Déposez votre attestation d''identifiant fiscal (DGI).', 'ارفع شهادة المعرف الضريبي (DGI).', 'file-text', 30, true, array['tax_declaration','juridique'], array['if','identifiant','fiscal','dgi']),
  ('ice', 'ICE', 'المعرف الموحد للمقاولة', 'Identifiant Commun de l''Entreprise — attestation ICE', 'المعرف الموحد للمقاولة — شهادة ICE', 'Téléversez l''attestation ICE (15 chiffres).', 'ارفع شهادة ICE (15 رقمًا).', 'hash', 40, true, array['juridique'], array['ice','identifiant','commun']),
  ('statuts_societe', 'Statuts de Société', 'النظام الأساسي للشركة', 'Statuts constitutifs, avenants, pactes d''associés', 'النظام الأساسي، التعديلات، اتفاقيات الشركاء', 'Déposez les statuts ou avenants aux statuts (SARL, SA…).', 'ارفع النظام الأساسي أو تعديلاته (شركة ذات مسؤولية محدودة، مساهمة…).', 'scroll', 50, true, array['company_statutes','juridique'], array['statuts','avenant','sarl','sa']),
  ('proces_verbaux', 'Procès-Verbaux (PV)', 'محاضر الجمعيات', 'PV AGO, AGE, décisions unanimes des associés', 'محاضر الجمعية العادية/الاستثنائية وقرارات الشركاء', 'Déposez les PV d''assemblées générales ordinaires ou extraordinaires.', 'ارفع محاضر الجمعية العامة العادية أو الاستثنائية.', 'gavel', 60, true, array['juridique','legal_contract'], array['pv','ago','age','assemblee']),
  ('contrats', 'Contrats', 'العقود', 'Baux, prestations, domiciliation, NDA, travail', 'عقود الكراء، الخدمات، الت domiciliation، السرية، الشغل', 'Téléversez vos contrats signés (bail, prestation, domiciliation…).', 'ارفع العقود الموقعة (كراء، خدمات، domiciliation…).', 'file-signature', 70, true, array['legal_contract','juridique'], array['contrat','bail','prestation','nda']),
  ('conventions', 'Conventions', 'الاتفاقيات', 'Conventions de gestion, pactes, accords de groupe', 'اتفاقيات الإدارة، اتفاقيات الشركاء، اتفاقيات المجموعة', 'Déposez conventions entre associés ou avec des tiers.', 'ارفع الاتفاقيات بين الشركاء أو مع الغير.', 'handshake', 80, true, array['legal_contract','juridique'], array['convention','pacte','accord']),
  ('fichiers_fiscaux', 'Fichiers fiscaux (DGI)', 'الملفات الضريبية', 'Liasse fiscale, déclarations TVA/IS/IR, attestations DGI', 'الحزمة الضريبية، تصريحات TVA/IS/IR، شهادات DGI', 'Déposez liasse, déclarations fiscales ou attestations DGI.', 'ارفع الحزمة الضريبية أو التصريحات أو شهادات DGI.', 'receipt', 90, true, array['tax_declaration','vat_declaration','accounting_document'], array['tva','is','ir','9421','dgi','liasse']),
  ('registres_legaux', 'Registres légaux', 'السجلات القانونية', 'Registre des associés, mouvements de titres, décisions', 'سجل الشركاء، حركة الحصص، القرارات', 'Déposez registre des associés ou mouvements de parts sociales.', 'ارفع سجل الشركاء أو حركة الحصص.', 'book', 100, true, array['legal_contract','accounting_document','juridique'], array['registre','associes','mouvements','decisions'])
on conflict do nothing;

-- Document types seed (linked by category slug)
do $$
declare
  cat_rc uuid;
  cat_pat uuid;
  cat_if uuid;
  cat_ice uuid;
  cat_stat uuid;
  cat_pv uuid;
  cat_ctr uuid;
  cat_conv uuid;
begin
  select id into cat_rc from public.atlas_juridique_categories where slug = 'registre_commerce' limit 1;
  select id into cat_pat from public.atlas_juridique_categories where slug = 'patente' limit 1;
  select id into cat_if from public.atlas_juridique_categories where slug = 'identifiant_fiscal' limit 1;
  select id into cat_ice from public.atlas_juridique_categories where slug = 'ice' limit 1;
  select id into cat_stat from public.atlas_juridique_categories where slug = 'statuts_societe' limit 1;
  select id into cat_pv from public.atlas_juridique_categories where slug = 'proces_verbaux' limit 1;
  select id into cat_ctr from public.atlas_juridique_categories where slug = 'contrats' limit 1;
  select id into cat_conv from public.atlas_juridique_categories where slug = 'conventions' limit 1;

  if cat_rc is not null then
    insert into public.atlas_juridique_document_types (category_id, slug, label_fr, label_ar, description_fr, description_ar, is_required, sort_order, is_system, moroccan_ref, fields)
    values
      (cat_rc, 'extrait_rc', 'Extrait RC / Kbis', 'مقتطف السجل التجاري', 'Extrait du registre de commerce', 'مقتطف من السجل التجاري', true, 10, true, 'RC', '[]'::jsonb),
      (cat_rc, 'certificat_negatif', 'Certificat négatif', 'شهادة سلبية', 'Certificat négatif de denomination', 'شهادة سلبية للتسمية', false, 20, true, 'RC', '[]'::jsonb)
    on conflict do nothing;
  end if;

  if cat_pat is not null then
    insert into public.atlas_juridique_document_types (category_id, slug, label_fr, label_ar, description_fr, description_ar, is_required, sort_order, is_system, moroccan_ref, fields)
    values (cat_pat, 'quittance_patente', 'Quittance de patente', 'وصل الضريبة المهنية', 'Quittance annuelle de taxe professionnelle', 'وصل سنوي للضريبة المهنية', true, 10, true, 'Patente', '[]'::jsonb)
    on conflict do nothing;
  end if;

  if cat_if is not null then
    insert into public.atlas_juridique_document_types (category_id, slug, label_fr, label_ar, description_fr, description_ar, is_required, sort_order, is_system, moroccan_ref, fields)
    values (cat_if, 'attestation_if', 'Attestation IF', 'شهادة المعرف الضريبي', 'Attestation identifiant fiscal DGI', 'شهادة المعرف الضريبي DGI', true, 10, true, 'IF', '[]'::jsonb)
    on conflict do nothing;
  end if;

  if cat_ice is not null then
    insert into public.atlas_juridique_document_types (category_id, slug, label_fr, label_ar, description_fr, description_ar, is_required, sort_order, is_system, moroccan_ref, fields)
    values (cat_ice, 'attestation_ice', 'Attestation ICE', 'شهادة ICE', 'Identifiant Commun de l''Entreprise', 'المعرف الموحد للمقاولة', true, 10, true, 'ICE', '[]'::jsonb)
    on conflict do nothing;
  end if;

  if cat_stat is not null then
    insert into public.atlas_juridique_document_types (category_id, slug, label_fr, label_ar, description_fr, description_ar, is_required, sort_order, is_system, moroccan_ref, fields, upload_prompt_fr, upload_prompt_ar)
    values
      (cat_stat, 'statuts_constitutifs', 'Statuts constitutifs', 'النظام الأساسي التأسيسي', 'Statuts à la constitution de la société', 'النظام الأساسي عند التأسيس', true, 10, true, 'Statuts', '[{"key":"gerant","labelFr":"Gérant","labelAr":"المدير"},{"key":"capital","labelFr":"Capital (MAD)","labelAr":"رأس المال (درهم)"}]'::jsonb, 'Statuts SARL/SA signés et enregistrés.', 'النظام الأساسي موقع ومسجل.'),
      (cat_stat, 'avenant_statuts', 'Avenant aux statuts', 'تعديل النظام الأساسي', 'Modification partielle des statuts', 'تعديل جزئي للنظام الأساسي', false, 20, true, 'Statuts', '[{"key":"article_modifie","labelFr":"Article modifié","labelAr":"المادة المعدلة"},{"key":"nouveau_texte","labelFr":"Nouveau texte","labelAr":"النص الجديد"}]'::jsonb, null, null)
    on conflict do nothing;
  end if;

  if cat_pv is not null then
    insert into public.atlas_juridique_document_types (category_id, slug, label_fr, label_ar, description_fr, description_ar, is_required, sort_order, is_system, moroccan_ref, fields)
    values
      (cat_pv, 'pv_ago', 'PV Assemblée Générale Ordinaire', 'محضر الجمعية العامة العادية', 'PV AGO annuelle', 'محضر الجمعية العامة العادية السنوية', false, 10, true, 'PV', '[{"key":"date_age","labelFr":"Date AGO","labelAr":"تاريخ الجمعية"},{"key":"exercice","labelFr":"Exercice","labelAr":"السنة المالية"}]'::jsonb),
      (cat_pv, 'pv_age', 'PV Assemblée Générale Extraordinaire', 'محضر الجمعية العامة الاستثنائية', 'PV AGE (modifications statutaires, capital…)', 'محضر الجمعية الاستثنائية (تعديل النظام، رأس المال…)', false, 20, true, 'PV', '[{"key":"date_age","labelFr":"Date AGE","labelAr":"تاريخ الجمعية"},{"key":"resolutions","labelFr":"Résolutions","labelAr":"القرارات"}]'::jsonb)
    on conflict do nothing;
  end if;

  if cat_ctr is not null then
    insert into public.atlas_juridique_document_types (category_id, slug, label_fr, label_ar, description_fr, description_ar, is_required, sort_order, is_system, moroccan_ref, fields)
    values
      (cat_ctr, 'contrat_bail', 'Contrat de bail commercial', 'عقد كراء تجاري', 'Location de local commercial', 'كراء محل تجاري', false, 10, true, 'Contrat', '[{"key":"bailleur","labelFr":"Bailleur","labelAr":"المكري"},{"key":"locataire","labelFr":"Locataire","labelAr":"المكتري"},{"key":"loyer_mensuel","labelFr":"Loyer mensuel (MAD)","labelAr":"الكراء الشهري (درهم)"}]'::jsonb),
      (cat_ctr, 'contrat_prestation', 'Contrat de prestation', 'عقد خدمات', 'Prestation de services B2B', 'تقديم خدمات بين الم profesionnels', false, 20, true, 'Contrat', '[{"key":"prestataire","labelFr":"Prestataire","labelAr":"مقدم الخدمة"},{"key":"client","labelFr":"Client","labelAr":"الزبون"},{"key":"honoraires","labelFr":"Honoraires (MAD)","labelAr":"الأتعاب (درهم)"}]'::jsonb),
      (cat_ctr, 'nda', 'Accord de confidentialité (NDA)', 'اتفاقية السرية', 'Non-disclosure agreement', 'اتفاقية عدم الإفشاء', false, 30, true, 'Contrat', '[{"key":"partie_1","labelFr":"Partie 1","labelAr":"الطرف 1"},{"key":"partie_2","labelFr":"Partie 2","labelAr":"الطرف 2"}]'::jsonb)
    on conflict do nothing;
  end if;

  if cat_conv is not null then
    insert into public.atlas_juridique_document_types (category_id, slug, label_fr, label_ar, description_fr, description_ar, is_required, sort_order, is_system, moroccan_ref, fields)
    values (cat_conv, 'convention_gestion', 'Convention de gestion', 'اتفاقية الإدارة', 'Convention entre associés ou avec gérant', 'اتفاقية بين الشركاء أو مع المدير', false, 10, true, 'Convention', '[]'::jsonb)
    on conflict do nothing;
  end if;
end $$;

-- Allow docx in export audit log
alter table public.zafirix_exports drop constraint if exists zafirix_exports_format_check;
alter table public.zafirix_exports add constraint zafirix_exports_format_check
  check (format in ('json','csv','xml','xlsx','pdf','zip','edi','docx'));

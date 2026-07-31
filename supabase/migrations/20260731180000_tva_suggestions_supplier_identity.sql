-- Persist supplier ICE/IF on TVA suggestions (DGI XML export + manual edits).
alter table public.zafirix_tva_suggestions
  add column if not exists supplier_ice text,
  add column if not exists supplier_if text;

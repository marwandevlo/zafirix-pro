-- Moroccan supplier patente (taxe professionnelle) on purchase invoices.

alter table public.atlas_supplier_invoices
  add column if not exists supplier_patente text;

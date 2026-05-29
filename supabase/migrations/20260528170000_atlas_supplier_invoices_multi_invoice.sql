-- Sprint E follow-up — multiple supplier invoices per OCR document.
-- Replaces (user_id, document_id) unique with (user_id, document_id, invoice_number, source_page).

alter table public.atlas_supplier_invoices
  add column if not exists source_page integer;

drop index if exists public.atlas_supplier_invoices_user_document_unique;

create unique index if not exists atlas_supplier_invoices_user_document_invoice_page_unique
  on public.atlas_supplier_invoices (
    user_id,
    document_id,
    coalesce(invoice_number, ''::text),
    coalesce(source_page, 0)
  )
  where document_id is not null;

create index if not exists atlas_supplier_invoices_document_source_page_idx
  on public.atlas_supplier_invoices (user_id, document_id, source_page);

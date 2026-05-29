# ZAFIRIX PRO — Invoice system stabilization

**Scope:** Client invoices (`atlas_invoices`), related payments (`atlas_payments`), PDF UX, VAT math, status workflow, linkage to `atlas_clients` / `atlas_companies`.

---

## Current classification: **PARTIAL → REAL**

**Strengths**

- Durable schema: UUID PK, `user_id`, optional `company_id` / `client_id`, monetary numerics, `atlas_invoice_status` enum, indexes on dates (`supabase/migrations/20260430030000_atlas_saas_entities_links.sql`).
- Repository `app/lib/atlas-invoices-repository.ts`: Supabase list/upsert/delete with `requireSupabaseUser()`; logs failures via `logAtlasServerEvent`.
- Fail-closed list on error (returns `[]`) — **UX risk** (silent empty) vs security; document and surface UI errors.

**Gaps**

1. **Dual mode:** localStorage still implemented for `local` backend — acceptable only if prod never uses `local` (true today); remove dead UI paths where possible.  
2. **Validation:** No server-side Zod for invoice payloads; amounts could be inconsistent (HT vs TVA vs TTC) if UI bugs.  
3. **Company/client linkage:** `upsertAtlasInvoice` accepts `opts.companyId` / `clientId` — ensure every UI save passes active company and selected client UUID.  
4. **Payments:** `atlas_payments` exists; confirm factures UI records payments in Supabase, not only local state.  
5. **PDF:** If `jspdf` runs client-side only, clarify that PDF is **generated on demand** and not stored unless uploaded as `atlas_documents`.  
6. **Search / export:** `/api/search` covers invoices; CSV/export if marketed must be implemented without fake data.  
7. **Status flow:** Enum `draft | sent | paid | cancelled` — ensure transitions validated (e.g. cannot edit `paid` without admin).

---

## Stabilization checklist

- [ ] Server route or RPC `upsert_invoice_validated` enforcing VAT consistency within epsilon.  
- [ ] UI displays Supabase errors on save/delete (no silent empty list without message).  
- [ ] E2E: create → refresh → edit → mark paid (if applicable) → PDF download.  
- [ ] RLS regression test with second user.  
- [ ] Optional: store `pdf_storage_path` in `metadata` after upload to Storage.

---

## References

- `app/lib/atlas-invoices-repository.ts`  
- `app/factures/page.tsx`  
- `INVOICE` section in `PRODUCTION_AUDIT_MASTER.md`

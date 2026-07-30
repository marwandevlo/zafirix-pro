-- Baseline: Zafirix Pro enterprise module tables (idempotent health check).
-- Run when production DB missed one or more 20260729–20260730 zafirix_* migrations.
--
-- This script does NOT recreate full schemas — apply timestamped migrations first:
--   20260729160000_zafirix_enterprise_modules.sql
--   20260730120000_zafirix_logistics_cod_tracking.sql
--   20260730140000_zafirix_notification_queue.sql
--   20260730150000_zafirix_advanced_inventory.sql
--   20260730160000_zafirix_petty_cash_advanced.sql
--   20260730170000_zafirix_tax_calendar.sql
--   20260730180000_zafirix_smart_debt_collection.sql
--   20260730190000_zafirix_smart_contracts.sql
--   20260730200000_zafirix_auditor_guest_pass_rbac.sql
--   20260730210000_zafirix_commissions_brokerage.sql
--   20260730220000_zafirix_courrier_correspondence.sql
--   20260730230000_zafirix_client_feedback.sql
--   20260730240000_zafirix_tax_whatif_planner.sql
--   20260730250000_zafirix_fixed_assets_ledger.sql
--   20260730260000_zafirix_hr_labor_compliance.sql
--   20260730270000_zafirix_corporate_governance.sql

do $$
declare
  required_tables text[] := array[
    -- Core enterprise (20260729160000)
    'zafirix_stores', 'zafirix_inventory_items', 'zafirix_inventory_stock',
    'zafirix_notifications', 'zafirix_deliveries', 'zafirix_petty_cash_entries',
    'zafirix_debt_collection_cases', 'zafirix_auditor_passes',
    -- Logistics COD (20260730120000)
    'zafirix_delivery_partners', 'zafirix_cod_reconciliations', 'zafirix_shipment_tracking_events',
    -- Notification queue (20260730140000)
    'zafirix_notification_queue',
    -- Advanced inventory (20260730150000)
    'zafirix_stock_movements', 'zafirix_stock_transfers', 'zafirix_stock_transfer_lines', 'zafirix_invoice_cogs',
    -- Petty cash advanced (20260730160000)
    'zafirix_petty_cash_funds', 'zafirix_petty_cash_vouchers',
    'zafirix_petty_cash_attachments', 'zafirix_petty_cash_approvals',
    -- Tax calendar (20260730170000)
    'zafirix_tax_deadlines', 'zafirix_compliance_events', 'zafirix_notification_preferences',
    -- Smart debt (20260730180000)
    'zafirix_client_risk_profiles', 'zafirix_debt_follow_ups',
    -- Contracts (20260730190000)
    'zafirix_contracts', 'zafirix_contract_parties', 'zafirix_contract_events',
    -- Auditor RBAC (20260730200000)
    'zafirix_auditor_access_log',
    -- Commissions (20260730210000)
    'zafirix_broker_tiers', 'zafirix_sales_agents', 'zafirix_commission_rules', 'zafirix_commission_entries',
    -- Courrier (20260730220000)
    'zafirix_correspondence', 'zafirix_correspondence_attachments',
    -- Client feedback (20260730230000)
    'zafirix_feedback_requests', 'zafirix_feedback_responses',
    -- Tax what-if (20260730240000)
    'zafirix_tax_whatif_scenarios',
    -- Fixed assets (20260730250000)
    'zafirix_fixed_assets', 'zafirix_depreciation_schedules',
    -- HR compliance (20260730260000)
    'zafirix_employment_contracts', 'zafirix_employee_documents',
    'zafirix_employee_attendance', 'zafirix_hr_compliance_items',
    -- Governance (20260730270000)
    'zafirix_board_members', 'zafirix_board_meetings',
    'zafirix_shareholder_resolutions', 'zafirix_governance_documents',
    'zafirix_governance_access_log'
  ];
  tbl text;
  missing text[] := '{}';
begin
  foreach tbl in array required_tables loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      missing := array_append(missing, tbl);
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise notice 'ZAFIRIX ENTERPRISE: missing tables: %', array_to_string(missing, ', ');
    raise notice 'Apply timestamped zafirix migrations listed in ensure_zafirix_enterprise_baseline.sql header.';
  else
    raise notice 'ZAFIRIX ENTERPRISE: all % required tables present.', array_length(required_tables, 1);
  end if;
end $$;

notify pgrst, 'reload schema';

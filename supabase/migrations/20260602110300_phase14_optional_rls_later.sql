-- Phase 14 optional: banking / payroll / liasse RLS + indexes
-- Apply AFTER Phase 11/12 tables exist. Every statement is dynamic + guarded.

DO $$
BEGIN
  IF to_regclass('public.zafirix_bank_statements') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.zafirix_bank_statements ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS bank_statements_own ON public.zafirix_bank_statements';
    EXECUTE $policy$
      CREATE POLICY bank_statements_own ON public.zafirix_bank_statements
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.zafirix_bank_transactions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.zafirix_bank_transactions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS bank_transactions_own ON public.zafirix_bank_transactions';
    EXECUTE $policy$
      CREATE POLICY bank_transactions_own ON public.zafirix_bank_transactions
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
    $policy$;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bank_tx_company ON public.zafirix_bank_transactions (company_id) WHERE company_id IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.atlas_bank_reconciliation') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.atlas_bank_reconciliation ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS bank_reconciliation_own ON public.atlas_bank_reconciliation';
    EXECUTE $policy$
      CREATE POLICY bank_reconciliation_own ON public.atlas_bank_reconciliation
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.atlas_payslip_extractions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.atlas_payslip_extractions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS payslip_extractions_own ON public.atlas_payslip_extractions';
    EXECUTE $policy$
      CREATE POLICY payslip_extractions_own ON public.atlas_payslip_extractions
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.zafirix_liasse_fiscale') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.zafirix_liasse_fiscale ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS liasse_fiscale_own ON public.zafirix_liasse_fiscale';
    EXECUTE $policy$
      CREATE POLICY liasse_fiscale_own ON public.zafirix_liasse_fiscale
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.atlas_liasse_fiscale') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.atlas_liasse_fiscale ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS liasse_fiscale_own ON public.atlas_liasse_fiscale';
    EXECUTE $policy$
      CREATE POLICY liasse_fiscale_own ON public.atlas_liasse_fiscale
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;


-- =====================================================================
-- Phase 6 migration: Financial Years, Suppliers, Staff, Payroll, Imports
-- =====================================================================

-- ---------- 1. FINANCIAL YEARS ----------
CREATE TABLE public.financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label text NOT NULL,                         -- "2024/2025"
  starts_on date NOT NULL,                     -- typically July 1
  ends_on date NOT NULL,                       -- typically June 30
  is_active boolean NOT NULL DEFAULT false,
  is_closed boolean NOT NULL DEFAULT false,
  closed_on timestamptz,
  closed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_years TO authenticated;
GRANT ALL ON public.financial_years TO service_role;
ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fy_select" ON public.financial_years FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "fy_write" ON public.financial_years FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));
CREATE TRIGGER trg_fy_updated BEFORE UPDATE ON public.financial_years
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 2. SUPPLIERS ----------
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  supplier_no text NOT NULL,                   -- SUP-0001
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  kra_pin text,
  bank_name text,
  bank_branch text,
  bank_account text,
  category text,                               -- Goods, Services, Utilities, etc.
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, supplier_no)
);
CREATE INDEX idx_suppliers_school ON public.suppliers(school_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sup_select" ON public.suppliers FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "sup_write" ON public.suppliers FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));
CREATE TRIGGER trg_sup_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.next_supplier_no(_school_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(supplier_no,'\D','','g'),'') AS int)),0)+1
    INTO n FROM public.suppliers WHERE school_id = _school_id;
  RETURN 'SUP-'||lpad(n::text,4,'0');
END $$;

-- ---------- 3. STAFF ----------
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_no text NOT NULL,
  full_name text NOT NULL,
  position text,
  department text,
  employment_date date,
  national_id text,
  kra_pin text,
  phone text,
  email text,
  gross_salary numeric(12,2) NOT NULL DEFAULT 0,
  bank_name text,
  bank_branch text,
  bank_account text,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, employee_no)
);
CREATE INDEX idx_staff_school ON public.staff(school_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_select" ON public.staff FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "staff_write" ON public.staff FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));
CREATE TRIGGER trg_staff_updated BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.next_employee_no(_school_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(employee_no,'\D','','g'),'') AS int)),0)+1
    INTO n FROM public.staff WHERE school_id = _school_id;
  RETURN 'EMP-'||lpad(n::text,4,'0');
END $$;

-- ---------- 4. PAYROLL ----------
CREATE TYPE payroll_status AS ENUM ('draft','approved','posted','cancelled');

CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  run_no text NOT NULL,                        -- PR-202506
  period_month date NOT NULL,                  -- first day of the month
  fund_id uuid NOT NULL REFERENCES public.funds(id),
  status payroll_status NOT NULL DEFAULT 'draft',
  total_gross numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  total_net numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  prepared_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  posted_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, run_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_select" ON public.payroll_runs FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "pr_write" ON public.payroll_runs FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));
CREATE TRIGGER trg_pr_updated BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id),
  gross numeric(12,2) NOT NULL DEFAULT 0,
  deductions jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{label,amount},...]
  total_deductions numeric(12,2) NOT NULL DEFAULT 0,
  net numeric(12,2) NOT NULL DEFAULT 0,
  voucher_id uuid REFERENCES public.payment_vouchers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pl_run ON public.payroll_lines(payroll_run_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_lines TO authenticated;
GRANT ALL ON public.payroll_lines TO service_role;
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pl_select" ON public.payroll_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payroll_runs r
                 WHERE r.id = payroll_lines.payroll_run_id
                   AND public.is_member(auth.uid(), r.school_id)));
CREATE POLICY "pl_write" ON public.payroll_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payroll_runs r
                 WHERE r.id = payroll_lines.payroll_run_id
                   AND public.can_write_money(auth.uid(), r.school_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.payroll_runs r
                 WHERE r.id = payroll_lines.payroll_run_id
                   AND public.can_write_money(auth.uid(), r.school_id)));

CREATE OR REPLACE FUNCTION public.next_payroll_no(_school_id uuid, _period date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN 'PR-'||to_char(_period,'YYYYMM');
END $$;

-- Post payroll: create draft vouchers per line and update totals
CREATE OR REPLACE FUNCTION public.post_payroll_run(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  r record;
  l record;
  vh_id uuid;
  v_no text;
  pv_id uuid;
  created_vouchers int := 0;
BEGIN
  SELECT * INTO r FROM public.payroll_runs WHERE id = _run_id;
  IF r IS NULL THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF NOT public.can_write_money(uid, r.school_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF r.status = 'posted' THEN
    RAISE EXCEPTION 'Payroll already posted';
  END IF;

  -- pick a "Salaries" vote head if available
  SELECT id INTO vh_id FROM public.vote_heads
   WHERE school_id = r.school_id AND fund_id = r.fund_id
     AND (lower(name) LIKE '%salar%' OR lower(name) LIKE '%payroll%' OR lower(name) LIKE '%wage%')
   LIMIT 1;

  FOR l IN SELECT pl.*, s.full_name AS staff_name
             FROM public.payroll_lines pl
             JOIN public.staff s ON s.id = pl.staff_id
            WHERE pl.payroll_run_id = _run_id
  LOOP
    IF l.voucher_id IS NOT NULL THEN CONTINUE; END IF;
    v_no := public.next_voucher_no(r.school_id);
    INSERT INTO public.payment_vouchers (
      school_id, fund_id, vote_head_id, staff_id, voucher_no, payee, amount, paid_on,
      method, memo, status, prepared_by, approved_by, is_demo
    ) VALUES (
      r.school_id, r.fund_id, vh_id, l.staff_id, v_no, l.staff_name, l.net, r.period_month,
      'bank'::payment_method, 'Salary — '||to_char(r.period_month,'Mon YYYY')||' (Run '||r.run_no||')',
      'paid'::voucher_status, uid, uid, r.is_demo
    ) RETURNING id INTO pv_id;
    UPDATE public.payroll_lines SET voucher_id = pv_id WHERE id = l.id;
    created_vouchers := created_vouchers + 1;
  END LOOP;

  UPDATE public.payroll_runs
     SET status='posted', posted_at=now(), approved_by=uid
   WHERE id = _run_id;

  RETURN jsonb_build_object('run_id', _run_id, 'vouchers_created', created_vouchers);
END $$;

-- ---------- 5. PV LINKS TO SUPPLIER / STAFF ----------
ALTER TABLE public.payment_vouchers
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

-- ---------- 6. IMPORT RUNS ----------
CREATE TABLE public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  entity text NOT NULL,                        -- students | staff | suppliers | fee_structures | opening_balances
  file_name text,
  ok_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ran_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.import_runs TO authenticated;
GRANT ALL ON public.import_runs TO service_role;
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir_select" ON public.import_runs FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "ir_insert" ON public.import_runs FOR INSERT TO authenticated
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

-- ---------- 7. CLOSE FINANCIAL YEAR ----------
CREATE OR REPLACE FUNCTION public.close_financial_year(_fy_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.financial_years WHERE id = _fy_id;
  IF r IS NULL THEN RAISE EXCEPTION 'Financial year not found'; END IF;
  IF NOT public.can_write_money(auth.uid(), r.school_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  UPDATE public.financial_years
    SET is_closed = true, is_active = false, closed_on = now(), closed_by = auth.uid()
   WHERE id = _fy_id;
END $$;

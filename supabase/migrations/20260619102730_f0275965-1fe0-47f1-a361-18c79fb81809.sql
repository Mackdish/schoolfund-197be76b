
-- 1. Voucher status enum
DO $$ BEGIN
  CREATE TYPE public.voucher_status AS ENUM ('draft','approved','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. payment_vouchers table
CREATE TABLE IF NOT EXISTS public.payment_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.funds(id),
  vote_head_id uuid REFERENCES public.vote_heads(id),
  voucher_no text NOT NULL,
  payee text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference text,
  memo text,
  status public.voucher_status NOT NULL DEFAULT 'draft',
  prepared_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, voucher_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_vouchers TO authenticated;
GRANT ALL ON public.payment_vouchers TO service_role;

ALTER TABLE public.payment_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read vouchers" ON public.payment_vouchers
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "Bursars can write vouchers" ON public.payment_vouchers
  FOR ALL TO authenticated USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

CREATE TRIGGER touch_payment_vouchers BEFORE UPDATE ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Extend chart of accounts with an expense account per fund
CREATE OR REPLACE FUNCTION public.ensure_chart_for_fund(_school_id uuid, _fund_id uuid, _fund_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE fc text := upper(_fund_code);
BEGIN
  INSERT INTO public.accounts (school_id, fund_id, code, name, type) VALUES
    (_school_id, _fund_id, '1000-CASH-'||fc, 'Cash & Bank — '||initcap(replace(_fund_code,'_',' ')), 'asset'),
    (_school_id, _fund_id, '1100-AR-'||fc,   'Fees Receivable — '||initcap(replace(_fund_code,'_',' ')), 'asset'),
    (_school_id, _fund_id, '4000-REV-'||fc,  'Fee Revenue — '||initcap(replace(_fund_code,'_',' ')), 'income'),
    (_school_id, _fund_id, '4100-BURS-'||fc, 'Bursary Income — '||initcap(replace(_fund_code,'_',' ')), 'income'),
    (_school_id, _fund_id, '5000-EXP-'||fc,  'Expenses — '||initcap(replace(_fund_code,'_',' ')), 'expense')
  ON CONFLICT DO NOTHING;
END $function$;

-- backfill expense accounts for existing funds
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, school_id, code::text AS code FROM public.funds LOOP
    PERFORM public.ensure_chart_for_fund(r.school_id, r.id, r.code);
  END LOOP;
END $$;

-- 4. Voucher number generator
CREATE OR REPLACE FUNCTION public.next_voucher_no(_school_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(voucher_no,'\D','','g'),'') AS int)),0) + 1
    INTO n FROM public.payment_vouchers WHERE school_id = _school_id;
  RETURN 'PV-'||lpad(n::text, 5, '0');
END $$;

-- 5. Post voucher: create JE + cashbook payment entry
CREATE OR REPLACE FUNCTION public.post_voucher(_voucher_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v record;
  je_id uuid;
  cash_acc uuid;
  exp_acc uuid;
  fc text;
  last_bal numeric;
BEGIN
  SELECT pv.*, f.code::text AS fund_code
    INTO v FROM public.payment_vouchers pv
    JOIN public.funds f ON f.id = pv.fund_id
   WHERE pv.id = _voucher_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v.journal_entry_id IS NOT NULL THEN RETURN v.journal_entry_id; END IF;

  fc := upper(v.fund_code);
  PERFORM public.ensure_chart_for_fund(v.school_id, v.fund_id, v.fund_code);

  SELECT id INTO cash_acc FROM public.accounts WHERE school_id = v.school_id AND code = '1000-CASH-'||fc;
  SELECT id INTO exp_acc  FROM public.accounts WHERE school_id = v.school_id AND code = '5000-EXP-'||fc;

  INSERT INTO public.journal_entries (school_id, entry_no, entry_date, memo, status, source_table, source_id, posted_by)
  VALUES (v.school_id, public.next_journal_no(v.school_id), v.paid_on,
          'Voucher '||v.voucher_no||' — '||v.payee, 'draft', 'payment_vouchers', v.id, v.prepared_by)
  RETURNING id INTO je_id;

  INSERT INTO public.journal_lines (journal_entry_id, account_id, fund_id, debit, credit, memo, line_no) VALUES
    (je_id, exp_acc,  v.fund_id, v.amount, 0, COALESCE(v.memo, v.payee), 1),
    (je_id, cash_acc, v.fund_id, 0, v.amount, 'Cash payment '||v.voucher_no, 2);

  UPDATE public.journal_entries SET status = 'posted' WHERE id = je_id;

  SELECT COALESCE(running_balance, 0) INTO last_bal
    FROM public.cashbook_entries
   WHERE school_id = v.school_id AND fund_id = v.fund_id
   ORDER BY entry_date DESC, created_at DESC LIMIT 1;
  IF last_bal IS NULL THEN
    SELECT COALESCE(opening_balance, 0) INTO last_bal FROM public.funds WHERE id = v.fund_id;
  END IF;

  INSERT INTO public.cashbook_entries (school_id, fund_id, entry_date, description, reference, receipts, payments, running_balance, journal_entry_id)
  VALUES (v.school_id, v.fund_id, v.paid_on,
          'Voucher '||v.voucher_no||' — '||v.payee, v.reference, 0, v.amount, last_bal - v.amount, je_id);

  UPDATE public.payment_vouchers SET journal_entry_id = je_id WHERE id = v.id;
  RETURN je_id;
END $$;

-- 6. Trigger to auto-post when status moves to paid
CREATE OR REPLACE FUNCTION public.tg_post_voucher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM public.post_voucher(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS post_voucher_on_paid ON public.payment_vouchers;
CREATE TRIGGER post_voucher_on_paid AFTER INSERT OR UPDATE ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.tg_post_voucher();

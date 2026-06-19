
-- Phase 3: Auto-posting & chart of accounts seeding

-- 1) Idempotent seeder: ensure default accounts exist per (school, fund)
CREATE OR REPLACE FUNCTION public.ensure_chart_for_fund(_school_id uuid, _fund_id uuid, _fund_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fc text := upper(_fund_code);
BEGIN
  INSERT INTO public.accounts (school_id, fund_id, code, name, type)
  VALUES
    (_school_id, _fund_id, '1000-CASH-'||fc, 'Cash & Bank — '||initcap(replace(_fund_code,'_',' ')), 'asset'),
    (_school_id, _fund_id, '1100-AR-'||fc,   'Fees Receivable — '||initcap(replace(_fund_code,'_',' ')), 'asset'),
    (_school_id, _fund_id, '4000-REV-'||fc,  'Fee Revenue — '||initcap(replace(_fund_code,'_',' ')), 'income'),
    (_school_id, _fund_id, '4100-BURS-'||fc, 'Bursary Income — '||initcap(replace(_fund_code,'_',' ')), 'income')
  ON CONFLICT DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.ensure_chart_for_fund(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_chart_for_fund(uuid, uuid, text) TO authenticated, service_role;

-- unique account code per school
CREATE UNIQUE INDEX IF NOT EXISTS accounts_school_code_idx ON public.accounts(school_id, code);

-- 2) Seed chart whenever a fund is created
CREATE OR REPLACE FUNCTION public.tg_seed_fund_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_chart_for_fund(NEW.school_id, NEW.id, NEW.code::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS funds_seed_accounts ON public.funds;
CREATE TRIGGER funds_seed_accounts AFTER INSERT ON public.funds
FOR EACH ROW EXECUTE FUNCTION public.tg_seed_fund_accounts();

-- Backfill for existing funds
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, school_id, code::text AS code FROM public.funds LOOP
    PERFORM public.ensure_chart_for_fund(r.school_id, r.id, r.code);
  END LOOP;
END $$;

-- 3) Generate sequential journal entry numbers per school
CREATE OR REPLACE FUNCTION public.next_journal_no(_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(entry_no, '\D','','g'),'') AS int)),0) + 1
    INTO n FROM public.journal_entries WHERE school_id = _school_id;
  RETURN 'JE-'||lpad(n::text, 6, '0');
END $$;

REVOKE ALL ON FUNCTION public.next_journal_no(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_journal_no(uuid) TO authenticated, service_role;

-- 4) Auto-post payment to journal + cashbook
CREATE OR REPLACE FUNCTION public.post_payment(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  je_id uuid;
  cash_acc uuid;
  ar_acc uuid;
  fc text;
  last_bal numeric;
BEGIN
  SELECT pay.*, f.code::text AS fund_code
    INTO p
    FROM public.payments pay
    JOIN public.funds f ON f.id = pay.fund_id
   WHERE pay.id = _payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- already posted?
  SELECT id INTO je_id FROM public.journal_entries
    WHERE source_table = 'payments' AND source_id = _payment_id;
  IF je_id IS NOT NULL THEN RETURN je_id; END IF;

  fc := upper(p.fund_code);

  -- ensure accounts exist (race-safe)
  PERFORM public.ensure_chart_for_fund(p.school_id, p.fund_id, p.fund_code);

  SELECT id INTO cash_acc FROM public.accounts WHERE school_id = p.school_id AND code = '1000-CASH-'||fc;
  SELECT id INTO ar_acc   FROM public.accounts WHERE school_id = p.school_id AND code = '1100-AR-'||fc;

  INSERT INTO public.journal_entries (school_id, entry_no, entry_date, memo, status, source_table, source_id, posted_by)
  VALUES (p.school_id, public.next_journal_no(p.school_id), p.paid_on, 'Receipt '||p.receipt_no, 'draft', 'payments', p.id, p.recorded_by)
  RETURNING id INTO je_id;

  INSERT INTO public.journal_lines (journal_entry_id, account_id, fund_id, debit, credit, memo, line_no) VALUES
    (je_id, cash_acc, p.fund_id, p.amount, 0, 'Cash receipt '||p.receipt_no, 1),
    (je_id, ar_acc,   p.fund_id, 0, p.amount, 'AR clearance '||p.receipt_no, 2);

  UPDATE public.journal_entries SET status = 'posted' WHERE id = je_id;

  -- cashbook running balance for fund
  SELECT COALESCE(running_balance, 0) INTO last_bal
    FROM public.cashbook_entries
   WHERE school_id = p.school_id AND fund_id = p.fund_id
   ORDER BY entry_date DESC, created_at DESC
   LIMIT 1;
  IF last_bal IS NULL THEN
    SELECT COALESCE(opening_balance, 0) INTO last_bal FROM public.funds WHERE id = p.fund_id;
  END IF;

  INSERT INTO public.cashbook_entries (school_id, fund_id, entry_date, description, reference, receipts, payments, running_balance, journal_entry_id)
  VALUES (p.school_id, p.fund_id, p.paid_on, COALESCE(p.payer_name,'Receipt')||' — '||p.receipt_no, p.reference, p.amount, 0, last_bal + p.amount, je_id);

  RETURN je_id;
END $$;

REVOKE ALL ON FUNCTION public.post_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_payment(uuid) TO authenticated, service_role;

-- 5) Trigger that auto-posts when a payment becomes confirmed
CREATE OR REPLACE FUNCTION public.tg_post_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    PERFORM public.post_payment(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payments_auto_post ON public.payments;
CREATE TRIGGER payments_auto_post AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.tg_post_payment();

-- 6) Backfill: post any existing confirmed payments without a journal
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.id FROM public.payments p
    LEFT JOIN public.journal_entries je ON je.source_table='payments' AND je.source_id=p.id
    WHERE p.status='confirmed' AND je.id IS NULL
    ORDER BY p.created_at
  LOOP
    PERFORM public.post_payment(r.id);
  END LOOP;
END $$;

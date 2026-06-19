
-- Phase 4: Bank statement import + promotion engine

-- Bank statement imports
CREATE TABLE public.bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  filename text NOT NULL,
  statement_from date,
  statement_to date,
  opening_balance numeric(14,2),
  closing_balance numeric(14,2),
  line_count integer DEFAULT 0,
  imported_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_imports TO authenticated;
GRANT ALL ON public.bank_statement_imports TO service_role;
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bsi_member_read"  ON public.bank_statement_imports FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "bsi_bursar_write" ON public.bank_statement_imports FOR ALL    TO authenticated USING (public.can_write_money(auth.uid(), school_id)) WITH CHECK (public.can_write_money(auth.uid(), school_id));
CREATE TRIGGER trg_bsi_updated BEFORE UPDATE ON public.bank_statement_imports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bank statement lines (one row per bank transaction)
CREATE TABLE public.bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  txn_date date NOT NULL,
  description text,
  reference text,
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  running_balance numeric(14,2),
  matched_cashbook_id uuid REFERENCES public.cashbook_entries(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unmatched',
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_lines TO authenticated;
GRANT ALL ON public.bank_statement_lines TO service_role;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bsl_member_read"  ON public.bank_statement_lines FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "bsl_bursar_write" ON public.bank_statement_lines FOR ALL    TO authenticated USING (public.can_write_money(auth.uid(), school_id)) WITH CHECK (public.can_write_money(auth.uid(), school_id));
CREATE INDEX bsl_school_fund_date_idx ON public.bank_statement_lines(school_id, fund_id, txn_date);
CREATE INDEX bsl_unmatched_idx ON public.bank_statement_lines(import_id) WHERE status = 'unmatched';

-- Link cashbook entries to statement lines
ALTER TABLE public.cashbook_entries
  ADD COLUMN IF NOT EXISTS bank_statement_line_id uuid REFERENCES public.bank_statement_lines(id) ON DELETE SET NULL;

-- Auto-match RPC: pair statement lines with cashbook entries by fund + amount + nearby date
CREATE OR REPLACE FUNCTION public.auto_match_bank_import(_import_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_count integer := 0;
  ln record;
  cb record;
BEGIN
  FOR ln IN
    SELECT * FROM public.bank_statement_lines
    WHERE import_id = _import_id AND status = 'unmatched'
  LOOP
    SELECT c.* INTO cb
      FROM public.cashbook_entries c
     WHERE c.school_id = ln.school_id
       AND c.fund_id  = ln.fund_id
       AND c.bank_statement_line_id IS NULL
       AND (
         (ln.credit > 0 AND c.receipts = ln.credit) OR
         (ln.debit  > 0 AND c.payments = ln.debit)
       )
       AND ABS(c.entry_date - ln.txn_date) <= 5
     ORDER BY ABS(c.entry_date - ln.txn_date) ASC, c.created_at ASC
     LIMIT 1;

    IF FOUND THEN
      UPDATE public.cashbook_entries
        SET bank_statement_line_id = ln.id, reconciled = true, reconciled_on = ln.txn_date
        WHERE id = cb.id;
      UPDATE public.bank_statement_lines
        SET matched_cashbook_id = cb.id, status = 'matched'
        WHERE id = ln.id;
      matched_count := matched_count + 1;
    END IF;
  END LOOP;
  RETURN matched_count;
END $$;

REVOKE ALL ON FUNCTION public.auto_match_bank_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_import(uuid) TO authenticated, service_role;

-- Manual unmatch helper (e.g., to break a wrong match)
CREATE OR REPLACE FUNCTION public.unmatch_bank_line(_line_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cb_id uuid;
BEGIN
  SELECT matched_cashbook_id INTO cb_id FROM public.bank_statement_lines WHERE id = _line_id;
  IF cb_id IS NOT NULL THEN
    UPDATE public.cashbook_entries SET bank_statement_line_id = NULL, reconciled = false, reconciled_on = NULL WHERE id = cb_id;
  END IF;
  UPDATE public.bank_statement_lines SET matched_cashbook_id = NULL, status = 'unmatched' WHERE id = _line_id;
END $$;
REVOKE ALL ON FUNCTION public.unmatch_bank_line(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmatch_bank_line(uuid) TO authenticated, service_role;

-- Promotion run: bump forms, snapshot carry-forward, generate new term invoices, apply bursaries, close from_term
CREATE OR REPLACE FUNCTION public.run_promotion(_school_id uuid, _from_term_id uuid, _to_term_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st record;
  next_class_id uuid;
  cur_form smallint;
  cur_stream text;
  fs record;
  it record;
  new_inv_id uuid;
  next_inv_seq int;
  carried_balance numeric;
  total_charges numeric;
  total_bursary_applied numeric;
  promoted_count int := 0;
  graduated_count int := 0;
  invoices_created int := 0;
  bursary_applied_sum numeric := 0;
  run_id uuid;
  bursary_credit numeric;
BEGIN
  -- Authorization: only admin or bursar of school
  IF NOT public.can_write_money(auth.uid(), _school_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- next invoice number seed
  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_no,'\D','','g'),'') AS int)),1000) + 1
    INTO next_inv_seq FROM public.invoices WHERE school_id = _school_id;

  -- iterate active students
  FOR st IN
    SELECT s.id, s.class_id, s.is_boarder, c.form, c.stream
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
     WHERE s.school_id = _school_id AND s.status = 'active'
  LOOP
    cur_form := st.form;
    cur_stream := st.stream;

    -- carry forward outstanding balance from from_term
    SELECT COALESCE(SUM(balance),0) INTO carried_balance
      FROM public.invoices
     WHERE school_id = _school_id AND student_id = st.id AND term_id = _from_term_id;

    IF cur_form >= 4 THEN
      UPDATE public.students
        SET status = 'graduated', exited_on = CURRENT_DATE, exit_reason = COALESCE(exit_reason,'KCSE — promotion run')
        WHERE id = st.id;
      graduated_count := graduated_count + 1;
      CONTINUE;
    END IF;

    -- find next-form class in same stream, fallback to any stream
    SELECT id INTO next_class_id FROM public.classes
      WHERE school_id = _school_id AND form = cur_form + 1 AND stream = cur_stream LIMIT 1;
    IF next_class_id IS NULL THEN
      SELECT id INTO next_class_id FROM public.classes
        WHERE school_id = _school_id AND form = cur_form + 1 ORDER BY stream LIMIT 1;
    END IF;
    IF next_class_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.students SET class_id = next_class_id WHERE id = st.id;
    promoted_count := promoted_count + 1;

    -- find fee structure for to_term for the new class + boarder flag
    SELECT fs2.id INTO fs FROM public.fee_structures fs2
      WHERE fs2.school_id = _school_id AND fs2.term_id = _to_term_id
        AND fs2.class_id = next_class_id AND fs2.is_boarder = st.is_boarder LIMIT 1;

    total_charges := 0;
    new_inv_id := NULL;

    IF fs.id IS NOT NULL THEN
      INSERT INTO public.invoices (school_id, student_id, term_id, invoice_no, opening_balance, total_charges, balance, notes)
      VALUES (_school_id, st.id, _to_term_id, 'INV-'||lpad(next_inv_seq::text,5,'0'),
              carried_balance, 0, carried_balance,
              CASE WHEN carried_balance <> 0 THEN 'Opening balance carried from previous term: '||carried_balance::text ELSE NULL END)
      RETURNING id INTO new_inv_id;
      next_inv_seq := next_inv_seq + 1;
      invoices_created := invoices_created + 1;

      FOR it IN SELECT vote_head_id, amount FROM public.fee_structure_items WHERE fee_structure_id = fs.id LOOP
        INSERT INTO public.invoice_items (invoice_id, vote_head_id, amount) VALUES (new_inv_id, it.vote_head_id, it.amount);
        total_charges := total_charges + it.amount;
      END LOOP;

      UPDATE public.invoices SET total_charges = total_charges, balance = carried_balance + total_charges
        WHERE id = new_inv_id;
    ELSIF carried_balance > 0 THEN
      -- no fee structure yet, but capture the carryforward as a placeholder invoice
      INSERT INTO public.invoices (school_id, student_id, term_id, invoice_no, opening_balance, total_charges, balance, notes)
      VALUES (_school_id, st.id, _to_term_id, 'INV-'||lpad(next_inv_seq::text,5,'0'),
              carried_balance, 0, carried_balance, 'Carry-forward only — fee structure pending')
      RETURNING id INTO new_inv_id;
      next_inv_seq := next_inv_seq + 1;
      invoices_created := invoices_created + 1;
    END IF;

    -- apply any unallocated bursary credit standing for this student
    IF new_inv_id IS NOT NULL THEN
      SELECT COALESCE(SUM(ba.amount),0) INTO bursary_credit
        FROM public.bursary_allocations ba
       WHERE ba.student_id = st.id AND ba.term_id = _to_term_id AND ba.invoice_id IS NULL;

      IF bursary_credit > 0 THEN
        UPDATE public.bursary_allocations SET invoice_id = new_inv_id
          WHERE student_id = st.id AND term_id = _to_term_id AND invoice_id IS NULL;
        UPDATE public.invoices
          SET total_bursary = COALESCE(total_bursary,0) + bursary_credit,
              balance = balance - bursary_credit,
              status = CASE WHEN balance - bursary_credit <= 0 THEN 'paid'::invoice_status ELSE status END
          WHERE id = new_inv_id;
        bursary_applied_sum := bursary_applied_sum + bursary_credit;
      END IF;
    END IF;
  END LOOP;

  -- close from_term, activate to_term
  UPDATE public.terms SET is_active = false, is_closed = true WHERE id = _from_term_id AND school_id = _school_id;
  UPDATE public.terms SET is_active = false WHERE school_id = _school_id;
  UPDATE public.terms SET is_active = true, is_closed = false WHERE id = _to_term_id AND school_id = _school_id;

  INSERT INTO public.promotion_runs (school_id, from_term_id, to_term_id, ran_by, students_promoted, balances_carried, status, notes)
  VALUES (_school_id, _from_term_id, _to_term_id, auth.uid(), promoted_count,
          (SELECT COALESCE(SUM(opening_balance),0) FROM public.invoices WHERE school_id=_school_id AND term_id=_to_term_id),
          'completed',
          format('Promoted %s · Graduated %s · Invoices %s · Bursary applied %s', promoted_count, graduated_count, invoices_created, bursary_applied_sum))
  RETURNING id INTO run_id;

  RETURN jsonb_build_object(
    'run_id', run_id,
    'promoted', promoted_count,
    'graduated', graduated_count,
    'invoices_created', invoices_created,
    'bursary_applied', bursary_applied_sum
  );
END $$;

REVOKE ALL ON FUNCTION public.run_promotion(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_promotion(uuid, uuid, uuid) TO authenticated, service_role;

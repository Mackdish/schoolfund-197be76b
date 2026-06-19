
-- 1) Schools: remove "with check true" insert; provide a SECURITY DEFINER RPC
DROP POLICY IF EXISTS "authenticated create school" ON public.schools;
-- Disallow direct INSERTs from the API entirely; creation goes through create_school()
-- (no INSERT policy => denied for non-service roles)

CREATE OR REPLACE FUNCTION public.create_school(
  _name text,
  _code text DEFAULT NULL,
  _county text DEFAULT NULL,
  _motto text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _name IS NULL OR length(btrim(_name)) = 0 THEN
    RAISE EXCEPTION 'School name required';
  END IF;
  INSERT INTO public.schools (name, code, county, motto)
  VALUES (btrim(_name), NULLIF(btrim(_code), ''), NULLIF(btrim(_county), ''), NULLIF(btrim(_motto), ''))
  RETURNING id INTO new_id;

  INSERT INTO public.user_roles (user_id, school_id, role)
  VALUES (uid, new_id, 'admin')
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET active_school_id = new_id WHERE id = uid;
  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_school(text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_school(text, text, text, text) TO authenticated;

-- 2) audit_log: remove client INSERT path; only SECURITY DEFINER functions write here
DROP POLICY IF EXISTS "audit insert" ON public.audit_log;
-- (no INSERT policy => API clients cannot insert; server-side definer functions still can)

-- 3) Lock down sensitive SECURITY DEFINER functions from anon/public.
-- Keep RLS-helper functions executable (they are called during policy evaluation).
REVOKE EXECUTE ON FUNCTION public.post_payment(uuid)                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_journal_no(uuid)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_chart_for_fund(uuid, uuid, text)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_post_payment()                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_seed_fund_accounts()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_journal_balance()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at()                              FROM PUBLIC, anon, authenticated;

-- Client-callable RPCs: restrict to authenticated; their bodies enforce role checks.
REVOKE EXECUTE ON FUNCTION public.run_promotion(uuid, uuid, uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auto_match_bank_import(uuid)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unmatch_bank_line(uuid)                         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.run_promotion(uuid, uuid, uuid)                 TO authenticated;
GRANT  EXECUTE ON FUNCTION public.auto_match_bank_import(uuid)                    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.unmatch_bank_line(uuid)                         TO authenticated;

-- Add server-side authorization to the bank-matching RPCs (defense in depth).
CREATE OR REPLACE FUNCTION public.auto_match_bank_import(_import_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_count integer := 0;
  ln record;
  cb record;
  _school uuid;
BEGIN
  SELECT school_id INTO _school FROM public.bank_statement_imports WHERE id = _import_id;
  IF _school IS NULL THEN RAISE EXCEPTION 'Import not found'; END IF;
  IF NOT public.can_write_money(auth.uid(), _school) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

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
END $function$;

CREATE OR REPLACE FUNCTION public.unmatch_bank_line(_line_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cb_id uuid; _school uuid;
BEGIN
  SELECT school_id INTO _school FROM public.bank_statement_lines WHERE id = _line_id;
  IF _school IS NULL THEN RAISE EXCEPTION 'Line not found'; END IF;
  IF NOT public.can_write_money(auth.uid(), _school) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT matched_cashbook_id INTO cb_id FROM public.bank_statement_lines WHERE id = _line_id;
  IF cb_id IS NOT NULL THEN
    UPDATE public.cashbook_entries SET bank_statement_line_id = NULL, reconciled = false, reconciled_on = NULL WHERE id = cb_id;
  END IF;
  UPDATE public.bank_statement_lines SET matched_cashbook_id = NULL, status = 'unmatched' WHERE id = _line_id;
END $function$;

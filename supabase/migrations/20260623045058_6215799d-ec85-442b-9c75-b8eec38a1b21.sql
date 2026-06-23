
ALTER TABLE public.students         ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices         ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.payments         ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.bursaries        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.seed_demo_data(_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  term_rec record;
  cls_rec record;
  fund_tui uuid; fund_ops uuid; fund_sf uuid;
  vh_tui uuid; vh_exm uuid; vh_board uuid; vh_lunch uuid; vh_ops_util uuid;
  student_ids uuid[] := ARRAY[]::uuid[];
  sid uuid; inv_id uuid;
  i int;
  names text[] := ARRAY[
    'Brian Mwangi','Faith Wanjiku','Kevin Otieno','Mercy Akinyi','Daniel Kiprop',
    'Joy Chebet','Samuel Njoroge','Esther Wambui','Allan Kimani','Linda Achieng',
    'Peter Mutua','Grace Nyambura','James Kariuki','Ruth Atieno','Victor Omondi',
    'Christine Wairimu','Eric Wanyama','Ann Muthoni','Felix Kibet','Susan Moraa'
  ];
  guardians text[] := ARRAY[
    'John Mwangi','Mary Wanjiku','Peter Otieno','Caroline Akinyi','Joseph Kiprop',
    'Agnes Chebet','Paul Njoroge','Lucy Wambui','David Kimani','Jane Achieng',
    'Stephen Mutua','Margaret Nyambura','Charles Kariuki','Beatrice Atieno','Michael Omondi',
    'Hellen Wairimu','Patrick Wanyama','Rose Muthoni','Geoffrey Kibet','Tabitha Moraa'
  ];
  phones text[] := ARRAY[
    '0712345001','0712345002','0712345003','0712345004','0712345005',
    '0712345006','0712345007','0712345008','0712345009','0712345010',
    '0712345011','0712345012','0712345013','0712345014','0712345015',
    '0712345016','0712345017','0712345018','0712345019','0712345020'
  ];
  pay_amounts numeric[] := ARRAY[15000, 20000, 12500, 8000, 25000, 18000];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_write_money(uid, _school_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO term_rec FROM public.terms WHERE school_id = _school_id AND is_active = true LIMIT 1;
  IF term_rec IS NULL THEN
    SELECT * INTO term_rec FROM public.terms WHERE school_id = _school_id ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF term_rec IS NULL THEN RAISE EXCEPTION 'No term configured'; END IF;

  SELECT id INTO fund_tui FROM public.funds WHERE school_id = _school_id AND code = 'tuition';
  SELECT id INTO fund_ops FROM public.funds WHERE school_id = _school_id AND code = 'operations';
  SELECT id INTO fund_sf  FROM public.funds WHERE school_id = _school_id AND code = 'school_fund';

  SELECT id INTO vh_tui     FROM public.vote_heads WHERE school_id = _school_id AND fund_id = fund_tui AND code = 'TUI' LIMIT 1;
  SELECT id INTO vh_exm     FROM public.vote_heads WHERE school_id = _school_id AND fund_id = fund_tui AND code = 'EXM' LIMIT 1;
  SELECT id INTO vh_ops_util FROM public.vote_heads WHERE school_id = _school_id AND fund_id = fund_ops LIMIT 1;
  SELECT id INTO vh_board   FROM public.vote_heads WHERE school_id = _school_id AND fund_id = fund_sf AND code = 'SF-BOARD' LIMIT 1;
  SELECT id INTO vh_lunch   FROM public.vote_heads WHERE school_id = _school_id AND fund_id = fund_sf AND code = 'SF-LUNCH' LIMIT 1;

  -- create fee structures per class (boarder + day) if not present
  FOR cls_rec IN SELECT * FROM public.classes WHERE school_id = _school_id ORDER BY form, stream LOOP
    DECLARE fs_b uuid; fs_d uuid;
    BEGIN
      INSERT INTO public.fee_structures (school_id, term_id, class_id, is_boarder, name)
      VALUES (_school_id, term_rec.id, cls_rec.id, true, 'Form '||cls_rec.form||cls_rec.stream||' Boarder')
      ON CONFLICT DO NOTHING RETURNING id INTO fs_b;
      IF fs_b IS NULL THEN
        SELECT id INTO fs_b FROM public.fee_structures WHERE school_id=_school_id AND term_id=term_rec.id AND class_id=cls_rec.id AND is_boarder=true;
      END IF;
      INSERT INTO public.fee_structures (school_id, term_id, class_id, is_boarder, name)
      VALUES (_school_id, term_rec.id, cls_rec.id, false, 'Form '||cls_rec.form||cls_rec.stream||' Day')
      ON CONFLICT DO NOTHING RETURNING id INTO fs_d;
      IF fs_d IS NULL THEN
        SELECT id INTO fs_d FROM public.fee_structures WHERE school_id=_school_id AND term_id=term_rec.id AND class_id=cls_rec.id AND is_boarder=false;
      END IF;

      IF vh_tui IS NOT NULL THEN
        INSERT INTO public.fee_structure_items (fee_structure_id, vote_head_id, amount) VALUES (fs_b, vh_tui, 18000) ON CONFLICT DO NOTHING;
        INSERT INTO public.fee_structure_items (fee_structure_id, vote_head_id, amount) VALUES (fs_d, vh_tui, 15000) ON CONFLICT DO NOTHING;
      END IF;
      IF vh_exm IS NOT NULL THEN
        INSERT INTO public.fee_structure_items (fee_structure_id, vote_head_id, amount) VALUES (fs_b, vh_exm, 1500) ON CONFLICT DO NOTHING;
        INSERT INTO public.fee_structure_items (fee_structure_id, vote_head_id, amount) VALUES (fs_d, vh_exm, 1500) ON CONFLICT DO NOTHING;
      END IF;
      IF vh_board IS NOT NULL THEN
        INSERT INTO public.fee_structure_items (fee_structure_id, vote_head_id, amount) VALUES (fs_b, vh_board, 12000) ON CONFLICT DO NOTHING;
      END IF;
      IF vh_lunch IS NOT NULL THEN
        INSERT INTO public.fee_structure_items (fee_structure_id, vote_head_id, amount) VALUES (fs_d, vh_lunch, 4500) ON CONFLICT DO NOTHING;
      END IF;
    END;
  END LOOP;

  -- create 20 demo students distributed across classes
  FOR i IN 1..20 LOOP
    SELECT id INTO cls_rec FROM public.classes WHERE school_id = _school_id
      ORDER BY form, stream
      OFFSET ((i-1) % GREATEST(1,(SELECT count(*) FROM public.classes WHERE school_id=_school_id))) LIMIT 1;

    INSERT INTO public.students (school_id, admission_no, full_name, gender, class_id, is_boarder, guardian_name, guardian_phone, guardian_relation, joined_on, is_demo)
    VALUES (
      _school_id,
      'DEMO-'||lpad(i::text,4,'0'),
      names[i],
      CASE WHEN i % 2 = 0 THEN 'F' ELSE 'M' END,
      cls_rec.id,
      (i % 3 <> 0),
      guardians[i],
      phones[i],
      'Parent',
      CURRENT_DATE - (i * 7),
      true
    )
    ON CONFLICT (school_id, admission_no) DO NOTHING
    RETURNING id INTO sid;

    IF sid IS NULL THEN
      SELECT id INTO sid FROM public.students WHERE school_id=_school_id AND admission_no='DEMO-'||lpad(i::text,4,'0');
    END IF;
    student_ids := array_append(student_ids, sid);
  END LOOP;

  -- create invoices for each demo student
  FOREACH sid IN ARRAY student_ids LOOP
    DECLARE
      st_rec record;
      fs_rec record;
      tot numeric := 0;
      next_no int;
    BEGIN
      SELECT s.*, c.form, c.stream INTO st_rec FROM public.students s JOIN public.classes c ON c.id=s.class_id WHERE s.id = sid;
      SELECT * INTO fs_rec FROM public.fee_structures WHERE school_id=_school_id AND term_id=term_rec.id AND class_id=st_rec.class_id AND is_boarder=st_rec.is_boarder LIMIT 1;
      IF fs_rec IS NULL THEN CONTINUE; END IF;

      SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_no,'\D','','g'),'') AS int)),1000)+1 INTO next_no FROM public.invoices WHERE school_id=_school_id;

      INSERT INTO public.invoices (school_id, student_id, term_id, invoice_no, opening_balance, total_charges, balance, notes, is_demo)
      VALUES (_school_id, sid, term_rec.id, 'INV-'||lpad(next_no::text,5,'0'), 0, 0, 0, 'Sample invoice', true)
      RETURNING id INTO inv_id;

      FOR fs_rec IN SELECT vote_head_id, amount FROM public.fee_structure_items WHERE fee_structure_id = fs_rec.id LOOP
        INSERT INTO public.invoice_items (invoice_id, vote_head_id, amount) VALUES (inv_id, fs_rec.vote_head_id, fs_rec.amount);
        tot := tot + fs_rec.amount;
      END LOOP;

      UPDATE public.invoices SET total_charges = tot, balance = tot WHERE id = inv_id;
    END;
  END LOOP;

  -- record payments for ~70% of students (random amounts)
  FOR i IN 1..array_length(student_ids,1) LOOP
    IF i % 10 < 7 THEN
      DECLARE
        next_rno int;
        amt numeric := pay_amounts[1 + (i % array_length(pay_amounts,1))];
        st_name text;
      BEGIN
        SELECT full_name INTO st_name FROM public.students WHERE id = student_ids[i];
        SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(receipt_no,'\D','','g'),'') AS int)),0)+1 INTO next_rno FROM public.payments WHERE school_id=_school_id;
        INSERT INTO public.payments (school_id, student_id, fund_id, receipt_no, method, reference, amount, paid_on, payer_name, notes, recorded_by, is_demo)
        VALUES (_school_id, student_ids[i], fund_tui,
                'RCT-'||lpad(next_rno::text,5,'0'),
                CASE i % 4 WHEN 0 THEN 'cash'::payment_method WHEN 1 THEN 'mpesa'::payment_method WHEN 2 THEN 'bank'::payment_method ELSE 'cheque'::payment_method END,
                'DEMO-REF-'||i, amt, CURRENT_DATE - (i*2), st_name, 'Sample payment', uid, true);
      END;
    END IF;
  END LOOP;

  -- a few sample payment vouchers (operations expenses)
  FOR i IN 1..4 LOOP
    DECLARE next_vno int;
    BEGIN
      SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(voucher_no,'\D','','g'),'') AS int)),0)+1 INTO next_vno FROM public.payment_vouchers WHERE school_id=_school_id;
      INSERT INTO public.payment_vouchers (school_id, fund_id, vote_head_id, voucher_no, payee, amount, paid_on, method, reference, memo, status, prepared_by, is_demo)
      VALUES (_school_id, fund_ops, vh_ops_util,
              'PV-'||lpad(next_vno::text,5,'0'),
              (ARRAY['Kenya Power','Nairobi Water','Office Supplies Ltd','School Bus Repair'])[i],
              (ARRAY[8500, 4200, 6700, 15000])[i],
              CURRENT_DATE - (i*5),
              'bank'::payment_method,
              'CHQ-000'||i,
              'Sample voucher',
              'paid'::voucher_status,
              uid,
              true);
    END;
  END LOOP;

  -- one sample bursary
  INSERT INTO public.bursaries (school_id, source, sponsor_name, reference, amount, notes, is_demo)
  VALUES (_school_id, 'cdf'::bursary_source, 'Sample CDF Office', 'CDF-DEMO-001', 50000, 'Sample bursary — delete from Settings', true);

  RETURN jsonb_build_object('students', array_length(student_ids,1), 'seeded', true);
END $$;


CREATE OR REPLACE FUNCTION public.clear_demo_data(_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  je_ids uuid[];
  cb_count int;
  pay_count int; voucher_count int; inv_count int; stu_count int; burs_count int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_write_money(uid, _school_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- collect journal entries linked to demo payments + vouchers
  SELECT array_agg(je.id) INTO je_ids
    FROM public.journal_entries je
   WHERE je.school_id = _school_id
     AND (
       (je.source_table='payments' AND je.source_id IN (SELECT id FROM public.payments WHERE school_id=_school_id AND is_demo))
       OR
       (je.source_table='payment_vouchers' AND je.source_id IN (SELECT id FROM public.payment_vouchers WHERE school_id=_school_id AND is_demo))
     );

  -- delete cashbook entries linked to those journal entries
  DELETE FROM public.cashbook_entries WHERE school_id=_school_id AND journal_entry_id = ANY(COALESCE(je_ids, ARRAY[]::uuid[]));
  GET DIAGNOSTICS cb_count = ROW_COUNT;

  -- delete journal lines + entries
  DELETE FROM public.journal_lines WHERE journal_entry_id = ANY(COALESCE(je_ids, ARRAY[]::uuid[]));
  DELETE FROM public.journal_entries WHERE id = ANY(COALESCE(je_ids, ARRAY[]::uuid[]));

  -- payments
  DELETE FROM public.payment_allocations WHERE payment_id IN (SELECT id FROM public.payments WHERE school_id=_school_id AND is_demo);
  DELETE FROM public.payments WHERE school_id=_school_id AND is_demo;
  GET DIAGNOSTICS pay_count = ROW_COUNT;

  -- vouchers
  DELETE FROM public.payment_vouchers WHERE school_id=_school_id AND is_demo;
  GET DIAGNOSTICS voucher_count = ROW_COUNT;

  -- bursary allocations + bursaries
  DELETE FROM public.bursary_allocations WHERE bursary_id IN (SELECT id FROM public.bursaries WHERE school_id=_school_id AND is_demo);
  DELETE FROM public.bursaries WHERE school_id=_school_id AND is_demo;
  GET DIAGNOSTICS burs_count = ROW_COUNT;

  -- invoices (items cascade)
  DELETE FROM public.invoices WHERE school_id=_school_id AND is_demo;
  GET DIAGNOSTICS inv_count = ROW_COUNT;

  -- students
  DELETE FROM public.students WHERE school_id=_school_id AND is_demo;
  GET DIAGNOSTICS stu_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'students', stu_count,
    'invoices', inv_count,
    'payments', pay_count,
    'vouchers', voucher_count,
    'bursaries', burs_count,
    'cashbook', cb_count
  );
END $$;

GRANT EXECUTE ON FUNCTION public.seed_demo_data(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_demo_data(uuid) TO authenticated;


-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin','bursar','principal','board');
CREATE TYPE public.fund_code AS ENUM ('tuition','operations','school_fund');
CREATE TYPE public.term_number AS ENUM ('1','2','3');
CREATE TYPE public.student_status AS ENUM ('active','transferred','graduated','withdrawn','deceased');
CREATE TYPE public.payment_method AS ENUM ('mpesa','kcb','equity','cash','cheque','bank_transfer','bursary','other');
CREATE TYPE public.payment_status AS ENUM ('pending','confirmed','reversed');
CREATE TYPE public.invoice_status AS ENUM ('open','partial','paid','void');
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','income','expense');
CREATE TYPE public.journal_status AS ENUM ('draft','posted','reversed');
CREATE TYPE public.bursary_source AS ENUM ('ng_cdf','county','capitation','sponsor','other');

-- =========================================================
-- updated_at trigger fn
-- =========================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================================================
-- SCHOOLS
-- =========================================================
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  county TEXT,
  motto TEXT,
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_schools_updated BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  active_school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- new user → profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- USER ROLES  (per-school)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, school_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _school_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND school_id = _school_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_member(_user_id UUID, _school_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND school_id = _school_id);
$$;

CREATE OR REPLACE FUNCTION public.can_write_money(_user_id UUID, _school_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND school_id = _school_id
      AND role IN ('bursar','admin'));
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID, _school_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND school_id = _school_id AND role = 'admin');
$$;

CREATE POLICY "roles visible to members" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid(), school_id))
  WITH CHECK (public.is_admin(auth.uid(), school_id));

-- schools RLS (after has_role exists)
CREATE POLICY "members read school" ON public.schools FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), id));
CREATE POLICY "admins update school" ON public.schools FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid(), id)) WITH CHECK (public.is_admin(auth.uid(), id));
CREATE POLICY "authenticated create school" ON public.schools FOR INSERT TO authenticated WITH CHECK (true);

-- =========================================================
-- Reusable policy macros via helper: a generic "school scoped" pattern
-- =========================================================

-- =========================================================
-- TERMS
-- =========================================================
CREATE TABLE public.terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year INT NOT NULL,
  term term_number NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, year, term)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terms TO authenticated;
GRANT ALL ON public.terms TO service_role;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_terms_updated BEFORE UPDATE ON public.terms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "terms read" ON public.terms FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "terms write" ON public.terms FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

-- =========================================================
-- CLASSES
-- =========================================================
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  form SMALLINT NOT NULL CHECK (form BETWEEN 1 AND 4),
  stream TEXT NOT NULL,
  teacher_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, form, stream)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_classes_updated BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "classes read" ON public.classes FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "classes write" ON public.classes FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

-- =========================================================
-- STUDENTS
-- =========================================================
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  admission_no TEXT NOT NULL,
  full_name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('M','F')),
  date_of_birth DATE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  status student_status NOT NULL DEFAULT 'active',
  is_boarder BOOLEAN NOT NULL DEFAULT false,
  kcpe_marks INT,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_relation TEXT,
  county_of_residence TEXT,
  joined_on DATE,
  exited_on DATE,
  exit_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, admission_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_students_school_class ON public.students(school_id, class_id);
CREATE POLICY "students read" ON public.students FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "students write" ON public.students FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

-- =========================================================
-- FUNDS (three statutory)
-- =========================================================
CREATE TABLE public.funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code fund_code NOT NULL,
  name TEXT NOT NULL,
  bank_name TEXT,
  bank_account_no TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funds TO authenticated;
GRANT ALL ON public.funds TO service_role;
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_funds_updated BEFORE UPDATE ON public.funds FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "funds read" ON public.funds FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "funds write" ON public.funds FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

-- =========================================================
-- VOTE HEADS
-- =========================================================
CREATE TABLE public.vote_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vote_heads TO authenticated;
GRANT ALL ON public.vote_heads TO service_role;
ALTER TABLE public.vote_heads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_vote_heads_updated BEFORE UPDATE ON public.vote_heads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "vote_heads read" ON public.vote_heads FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "vote_heads write" ON public.vote_heads FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

-- =========================================================
-- FEE STRUCTURES
-- =========================================================
CREATE TABLE public.fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  is_boarder BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (term_id, class_id, is_boarder)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_structures TO authenticated;
GRANT ALL ON public.fee_structures TO service_role;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fee_structures_updated BEFORE UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "fee_structures read" ON public.fee_structures FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "fee_structures write" ON public.fee_structures FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

CREATE TABLE public.fee_structure_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id UUID NOT NULL REFERENCES public.fee_structures(id) ON DELETE CASCADE,
  vote_head_id UUID NOT NULL REFERENCES public.vote_heads(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fee_structure_id, vote_head_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_structure_items TO authenticated;
GRANT ALL ON public.fee_structure_items TO service_role;
ALTER TABLE public.fee_structure_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsi read" ON public.fee_structure_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fee_structures fs WHERE fs.id = fee_structure_id AND public.is_member(auth.uid(), fs.school_id)));
CREATE POLICY "fsi write" ON public.fee_structure_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fee_structures fs WHERE fs.id = fee_structure_id AND public.can_write_money(auth.uid(), fs.school_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fee_structures fs WHERE fs.id = fee_structure_id AND public.can_write_money(auth.uid(), fs.school_id)));

-- =========================================================
-- INVOICES (per student per term)
-- =========================================================
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE RESTRICT,
  invoice_no TEXT NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_bursary NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, invoice_no),
  UNIQUE (student_id, term_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_invoices_student ON public.invoices(student_id);
CREATE POLICY "invoices read" ON public.invoices FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "invoices write" ON public.invoices FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  vote_head_id UUID NOT NULL REFERENCES public.vote_heads(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE POLICY "ii read" ON public.invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.is_member(auth.uid(), i.school_id)));
CREATE POLICY "ii write" ON public.invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_write_money(auth.uid(), i.school_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_write_money(auth.uid(), i.school_id)));

-- =========================================================
-- PAYMENTS
-- =========================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE RESTRICT,
  receipt_no TEXT NOT NULL,
  method payment_method NOT NULL,
  reference TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  status payment_status NOT NULL DEFAULT 'confirmed',
  payer_name TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, receipt_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_payments_student ON public.payments(student_id);
CREATE INDEX idx_payments_paid_on ON public.payments(school_id, paid_on);
CREATE POLICY "payments read" ON public.payments FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "payments write" ON public.payments FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

CREATE TABLE public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_item_id UUID NOT NULL REFERENCES public.invoice_items(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pa_payment ON public.payment_allocations(payment_id);
CREATE INDEX idx_pa_item ON public.payment_allocations(invoice_item_id);
CREATE POLICY "pa read" ON public.payment_allocations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_id AND public.is_member(auth.uid(), p.school_id)));
CREATE POLICY "pa write" ON public.payment_allocations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_id AND public.can_write_money(auth.uid(), p.school_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_id AND public.can_write_money(auth.uid(), p.school_id)));

-- =========================================================
-- BURSARIES
-- =========================================================
CREATE TABLE public.bursaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  source bursary_source NOT NULL,
  sponsor_name TEXT,
  reference TEXT,
  received_on DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  amount_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bursaries TO authenticated;
GRANT ALL ON public.bursaries TO service_role;
ALTER TABLE public.bursaries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_bursaries_updated BEFORE UPDATE ON public.bursaries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "bursaries read" ON public.bursaries FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "bursaries write" ON public.bursaries FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

CREATE TABLE public.bursary_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bursary_id UUID NOT NULL REFERENCES public.bursaries(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  term_id UUID REFERENCES public.terms(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bursary_allocations TO authenticated;
GRANT ALL ON public.bursary_allocations TO service_role;
ALTER TABLE public.bursary_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba read" ON public.bursary_allocations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bursaries b WHERE b.id = bursary_id AND public.is_member(auth.uid(), b.school_id)));
CREATE POLICY "ba write" ON public.bursary_allocations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bursaries b WHERE b.id = bursary_id AND public.can_write_money(auth.uid(), b.school_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bursaries b WHERE b.id = bursary_id AND public.can_write_money(auth.uid(), b.school_id)));

-- =========================================================
-- CHART OF ACCOUNTS
-- =========================================================
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  fund_id UUID REFERENCES public.funds(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type account_type NOT NULL,
  parent_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "accounts read" ON public.accounts FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "accounts write" ON public.accounts FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

-- =========================================================
-- JOURNAL ENTRIES + LINES (double-entry)
-- =========================================================
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  entry_no TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  memo TEXT,
  status journal_status NOT NULL DEFAULT 'draft',
  source_table TEXT,
  source_id UUID,
  posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, entry_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_journal_entries_updated BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "je read" ON public.journal_entries FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "je write" ON public.journal_entries FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

CREATE TABLE public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  fund_id UUID REFERENCES public.funds(id) ON DELETE SET NULL,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo TEXT,
  line_no SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((debit = 0) <> (credit = 0))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_jl_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX idx_jl_account ON public.journal_lines(account_id);
CREATE POLICY "jl read" ON public.journal_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.id = journal_entry_id AND public.is_member(auth.uid(), j.school_id)));
CREATE POLICY "jl write" ON public.journal_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.id = journal_entry_id AND public.can_write_money(auth.uid(), j.school_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.id = journal_entry_id AND public.can_write_money(auth.uid(), j.school_id)));

-- Enforce balanced journal on post
CREATE OR REPLACE FUNCTION public.enforce_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE tot_debit NUMERIC; tot_credit NUMERIC;
BEGIN
  IF NEW.status = 'posted' AND (OLD.status IS DISTINCT FROM 'posted') THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
      INTO tot_debit, tot_credit
      FROM public.journal_lines WHERE journal_entry_id = NEW.id;
    IF tot_debit <> tot_credit OR tot_debit = 0 THEN
      RAISE EXCEPTION 'Journal % not balanced (debit=%, credit=%)', NEW.entry_no, tot_debit, tot_credit;
    END IF;
    NEW.posted_at = now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_je_balance BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_journal_balance();

-- =========================================================
-- CASHBOOK
-- =========================================================
CREATE TABLE public.cashbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE RESTRICT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  reference TEXT,
  receipts NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (receipts >= 0),
  payments NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (payments >= 0),
  running_balance NUMERIC(14,2),
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  reconciled BOOLEAN NOT NULL DEFAULT false,
  reconciled_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashbook_entries TO authenticated;
GRANT ALL ON public.cashbook_entries TO service_role;
ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_cashbook_updated BEFORE UPDATE ON public.cashbook_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_cashbook_fund_date ON public.cashbook_entries(fund_id, entry_date);
CREATE POLICY "cb read" ON public.cashbook_entries FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "cb write" ON public.cashbook_entries FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

CREATE TABLE public.bank_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE RESTRICT,
  statement_date DATE NOT NULL,
  statement_balance NUMERIC(14,2) NOT NULL,
  cashbook_balance NUMERIC(14,2) NOT NULL,
  reconciled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_reconciliations TO authenticated;
GRANT ALL ON public.bank_reconciliations TO service_role;
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_brec_updated BEFORE UPDATE ON public.bank_reconciliations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "brec read" ON public.bank_reconciliations FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "brec write" ON public.bank_reconciliations FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

-- =========================================================
-- PROMOTION RUNS
-- =========================================================
CREATE TABLE public.promotion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  from_term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE RESTRICT,
  to_term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE RESTRICT,
  ran_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  students_promoted INT NOT NULL DEFAULT 0,
  balances_carried NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_runs TO authenticated;
GRANT ALL ON public.promotion_runs TO service_role;
ALTER TABLE public.promotion_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prom read" ON public.promotion_runs FOR SELECT TO authenticated USING (public.is_member(auth.uid(), school_id));
CREATE POLICY "prom write" ON public.promotion_runs FOR ALL TO authenticated
  USING (public.can_write_money(auth.uid(), school_id))
  WITH CHECK (public.can_write_money(auth.uid(), school_id));

-- =========================================================
-- AUDIT LOG
-- =========================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_school_created ON public.audit_log(school_id, created_at DESC);
CREATE POLICY "audit read" ON public.audit_log FOR SELECT TO authenticated
  USING (school_id IS NULL OR public.is_member(auth.uid(), school_id));
CREATE POLICY "audit insert" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (school_id IS NULL OR public.is_member(auth.uid(), school_id));

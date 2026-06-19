
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS receipt_footer text;

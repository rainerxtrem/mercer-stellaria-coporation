
-- Atomic per-year counters for document numbering (matters, invoices, disciplinary cases)
CREATE TABLE IF NOT EXISTS app_private.number_counters (
  prefix TEXT NOT NULL,
  year INT NOT NULL,
  last_seq INT NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
);

REVOKE ALL ON app_private.number_counters FROM PUBLIC, anon, authenticated;

-- Atomic sequence allocator: INSERT ... ON CONFLICT ... RETURNING is atomic and
-- takes a row lock, guaranteeing unique monotonically increasing sequence values
-- even under concurrent transactions.
CREATE OR REPLACE FUNCTION app_private.next_seq(_prefix TEXT, _year INT)
RETURNS INT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
  INSERT INTO app_private.number_counters (prefix, year, last_seq)
  VALUES (_prefix, _year, 1)
  ON CONFLICT (prefix, year)
    DO UPDATE SET last_seq = app_private.number_counters.last_seq + 1
  RETURNING last_seq;
$$;

REVOKE ALL ON FUNCTION app_private.next_seq(TEXT, INT) FROM PUBLIC, anon, authenticated;

-- Seed counters from existing max values so we never collide with existing rows.
INSERT INTO app_private.number_counters (prefix, year, last_seq)
SELECT 'SA', EXTRACT(YEAR FROM opened_on)::INT,
       COALESCE(MAX(NULLIF(regexp_replace(number, '^SA-\d{4}-', ''), '')::INT), 0)
FROM public.matters
GROUP BY EXTRACT(YEAR FROM opened_on)
ON CONFLICT (prefix, year) DO UPDATE
  SET last_seq = GREATEST(app_private.number_counters.last_seq, EXCLUDED.last_seq);

INSERT INTO app_private.number_counters (prefix, year, last_seq)
SELECT 'FAC', EXTRACT(YEAR FROM issue_date)::INT,
       COALESCE(MAX(NULLIF(regexp_replace(number, '^FAC-\d{4}-', ''), '')::INT), 0)
FROM public.invoices WHERE kind = 'invoice' AND number IS NOT NULL AND number LIKE 'FAC-%'
GROUP BY EXTRACT(YEAR FROM issue_date)
ON CONFLICT (prefix, year) DO UPDATE
  SET last_seq = GREATEST(app_private.number_counters.last_seq, EXCLUDED.last_seq);

INSERT INTO app_private.number_counters (prefix, year, last_seq)
SELECT 'DEV', EXTRACT(YEAR FROM issue_date)::INT,
       COALESCE(MAX(NULLIF(regexp_replace(number, '^DEV-\d{4}-', ''), '')::INT), 0)
FROM public.invoices WHERE kind = 'quote' AND number IS NOT NULL AND number LIKE 'DEV-%'
GROUP BY EXTRACT(YEAR FROM issue_date)
ON CONFLICT (prefix, year) DO UPDATE
  SET last_seq = GREATEST(app_private.number_counters.last_seq, EXCLUDED.last_seq);

INSERT INTO app_private.number_counters (prefix, year, last_seq)
SELECT 'DISC', EXTRACT(YEAR FROM opened_at)::INT,
       COALESCE(MAX(NULLIF(regexp_replace(number, '^DISC-\d{4}-', ''), '')::INT), 0)
FROM public.disciplinary_cases WHERE number IS NOT NULL AND number LIKE 'DISC-%'
GROUP BY EXTRACT(YEAR FROM opened_at)
ON CONFLICT (prefix, year) DO UPDATE
  SET last_seq = GREATEST(app_private.number_counters.last_seq, EXCLUDED.last_seq);

-- Rewrite the three number-setting triggers to use the atomic allocator.
CREATE OR REPLACE FUNCTION public.matters_set_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM COALESCE(NEW.opened_on, CURRENT_DATE));
  seq INT;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN RETURN NEW; END IF;
  seq := app_private.next_seq('SA', y);
  NEW.number := 'SA-' || y || '-' || lpad(seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoices_set_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM COALESCE(NEW.issue_date, CURRENT_DATE));
  prefix TEXT := CASE WHEN NEW.kind = 'quote' THEN 'DEV' ELSE 'FAC' END;
  seq INT;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN RETURN NEW; END IF;
  seq := app_private.next_seq(prefix, y);
  NEW.number := prefix || '-' || y || '-' || lpad(seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.disciplinary_cases_set_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM COALESCE(NEW.opened_at, CURRENT_DATE));
  seq INT;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN RETURN NEW; END IF;
  seq := app_private.next_seq('DISC', y);
  NEW.number := 'DISC-' || y || '-' || lpad(seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

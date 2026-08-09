-- Use a dedicated counter table for insurance request numbering so inserts do
-- not query the RLS-protected request tables.

CREATE TABLE IF NOT EXISTS public.insurance_request_counters (
  module_slug text NOT NULL,
  request_year integer NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module_slug, request_year)
);

ALTER TABLE public.insurance_request_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.insurance_request_counters FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_request_counters TO service_role;

CREATE OR REPLACE FUNCTION public.insurance_claims_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_value integer := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()));
  sequence_value integer;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.insurance_request_counters (module_slug, request_year, last_sequence)
  VALUES ('claims', year_value, 1)
  ON CONFLICT (module_slug, request_year)
  DO UPDATE SET
    last_sequence = public.insurance_request_counters.last_sequence + 1,
    updated_at = now()
  RETURNING last_sequence INTO sequence_value;

  NEW.number := 'SIN-' || year_value || '-' || lpad(sequence_value::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_requests_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_value integer := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()));
  sequence_value integer;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.insurance_request_counters (module_slug, request_year, last_sequence)
  VALUES ('refunds', year_value, 1)
  ON CONFLICT (module_slug, request_year)
  DO UPDATE SET
    last_sequence = public.insurance_request_counters.last_sequence + 1,
    updated_at = now()
  RETURNING last_sequence INTO sequence_value;

  NEW.number := 'REM-' || year_value || '-' || lpad(sequence_value::text, 5, '0');
  RETURN NEW;
END;
$$;

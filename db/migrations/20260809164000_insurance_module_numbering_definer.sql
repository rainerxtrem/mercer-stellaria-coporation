-- Ensure insurance request numbering triggers can read their own tables under RLS.

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

  SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '^SIN-[0-9]{4}-', ''), '')::integer), 0) + 1
    INTO sequence_value
    FROM public.insurance_claims
   WHERE number LIKE 'SIN-' || year_value || '-%';

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

  SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '^REM-[0-9]{4}-', ''), '')::integer), 0) + 1
    INTO sequence_value
    FROM public.refund_requests
   WHERE number LIKE 'REM-' || year_value || '-%';

  NEW.number := 'REM-' || year_value || '-' || lpad(sequence_value::text, 5, '0');
  RETURN NEW;
END;
$$;

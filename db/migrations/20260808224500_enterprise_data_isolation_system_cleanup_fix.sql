-- Follow-up for enterprise isolation hardening.
-- Allow system-level maintenance operations (auth.uid() is null),
-- while keeping strict firm immutability for authenticated users.

CREATE OR REPLACE FUNCTION app_private.assign_client_firm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_firm uuid;
BEGIN
  active_firm := app_private.user_active_firm_id(auth.uid());

  IF TG_OP = 'INSERT' THEN
    IF NEW.firm_id IS NULL THEN
      NEW.firm_id := COALESCE(active_firm, app_private.get_user_firm_id(NEW.owner_id));
    END IF;
    IF NEW.firm_id IS NULL THEN
      RAISE EXCEPTION 'Client must belong to an enterprise';
    END IF;
  ELSE
    IF auth.uid() IS NOT NULL AND NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
      RAISE EXCEPTION 'Changing client enterprise is forbidden';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.assign_client_firm() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.assign_client_firm() TO authenticated, service_role;

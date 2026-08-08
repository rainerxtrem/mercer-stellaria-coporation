
-- 1) Revoke EXECUTE broadly on all public SECURITY DEFINER functions, then re-grant narrowly

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Public (anon + authenticated) RPCs used by the public website
GRANT EXECUTE ON FUNCTION public.get_public_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_lawyer(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_disciplinary_decisions() TO anon, authenticated;

-- Authenticated-only helpers (used by RLS policies or authenticated RPC calls)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_matter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_firm_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_firm_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_lawyers() TO authenticated;

-- Trigger functions, handle_new_user, next_bar_license, bar_exam_recompute_total, set_updated_at,
-- invoices_set_number, matters_set_number, audit_log_row, disciplinary_apply_sanction,
-- lawyers_guard_self_update, notify_* : run inside triggers or from server-side privileged code.
-- They must NOT be callable by anon/authenticated. No GRANT needed.

-- 2) Tighten permissive INSERT policies on public-facing forms

DROP POLICY IF EXISTS contact_public_insert ON public.contact_requests;
CREATE POLICY contact_public_insert ON public.contact_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(first_name)) BETWEEN 1 AND 120
    AND length(btrim(last_name))  BETWEEN 1 AND 120
    AND length(btrim(subject))    BETWEEN 3 AND 200
    AND length(btrim(message))    BETWEEN 10 AND 5000
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND length(email) <= 254
  );

DROP POLICY IF EXISTS disc_complaints_public_insert ON public.disciplinary_complaints;
CREATE POLICY disc_complaints_public_insert ON public.disciplinary_complaints
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(complainant_name))  BETWEEN 1 AND 200
    AND length(btrim(subject))       BETWEEN 3 AND 200
    AND length(btrim(description))   BETWEEN 20 AND 10000
    AND complainant_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND length(complainant_email) <= 254
  );

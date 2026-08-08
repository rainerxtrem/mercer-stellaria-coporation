
-- === 1. LAWYERS public read: hide PII ===
DROP POLICY IF EXISTS lawyers_public_read ON public.lawyers;

CREATE OR REPLACE VIEW public.lawyers_public
WITH (security_invoker = true) AS
SELECT id, license, first_name, last_name, photo_url, firm_id,
       specialty, city, status, admitted_on, bio, created_at
FROM public.lawyers;

-- Allow reading via the view (needs base table SELECT under security_invoker).
-- Add a narrow policy that only exposes non-PII implicitly via the view's column list.
-- Since RLS can't restrict columns, we allow SELECT on the base table publicly BUT
-- revoke column-level SELECT on PII columns from anon/authenticated.
CREATE POLICY lawyers_public_read ON public.lawyers
  FOR SELECT USING (true);

REVOKE SELECT ON public.lawyers FROM anon, authenticated;
GRANT SELECT (id, license, first_name, last_name, photo_url, firm_id,
              specialty, city, status, admitted_on, bio, created_at, updated_at, profile_id)
  ON public.lawyers TO authenticated;
GRANT SELECT (id, license, first_name, last_name, photo_url, firm_id,
              specialty, city, status, admitted_on, bio, created_at)
  ON public.lawyers TO anon;
GRANT INSERT, UPDATE, DELETE ON public.lawyers TO authenticated;
GRANT ALL ON public.lawyers TO service_role;
GRANT SELECT ON public.lawyers_public TO anon, authenticated;

-- Batonnier needs full column access; ALL policy already covers row-level. Column privs
-- are role-based, so we add explicit privileges for authenticated on PII too, gated by RLS.
-- To let the batonnier read PII, grant PII columns to authenticated but rely on RLS?
-- RLS still applies row-level only. Column grants apply to all rows.
-- Solution: expose PII columns only through a security definer function/view for batonnier.

CREATE OR REPLACE VIEW public.lawyers_admin
WITH (security_invoker = true) AS
SELECT * FROM public.lawyers;

-- Grant PII columns to authenticated as well so batonnier queries work; RLS still prevents
-- non-batonnier reads of hidden rows? No — lawyers_public_read is true for all. So PII would leak.
-- Instead: only grant PII columns to service_role, and route batonnier admin reads through
-- a SECURITY DEFINER function.

REVOKE SELECT ON public.lawyers_admin FROM anon, authenticated;
GRANT SELECT ON public.lawyers_admin TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_lawyers()
RETURNS SETOF public.lawyers
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'batonnier') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT * FROM public.lawyers ORDER BY last_name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_lawyers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_lawyers() TO authenticated;

-- === 2. LAWYERS self-update: restrict columns ===
DROP POLICY IF EXISTS lawyers_update_own ON public.lawyers;

CREATE OR REPLACE FUNCTION public.lawyers_guard_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Batonniers can change anything
  IF public.has_role(auth.uid(), 'batonnier') THEN
    RETURN NEW;
  END IF;

  -- Non-batonnier self-updates: block changes to regulated fields
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.license IS DISTINCT FROM OLD.license
     OR NEW.admitted_on IS DISTINCT FROM OLD.admitted_on
     OR NEW.firm_id IS DISTINCT FROM OLD.firm_id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    RAISE EXCEPTION 'Only the Bâtonnier can modify regulated fields (status, license, admitted_on, firm, name).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lawyers_guard_self_update_trg ON public.lawyers;
CREATE TRIGGER lawyers_guard_self_update_trg
  BEFORE UPDATE ON public.lawyers
  FOR EACH ROW EXECUTE FUNCTION public.lawyers_guard_self_update();

CREATE POLICY lawyers_update_own ON public.lawyers
  FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- === 3. PROFILES: restrict to own or batonnier ===
DROP POLICY IF EXISTS profiles_select_all_auth ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'batonnier'));

-- === 4. STORAGE: policies for bar-media bucket ===
DROP POLICY IF EXISTS "bar_media_batonnier_all" ON storage.objects;
CREATE POLICY "bar_media_batonnier_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'bar-media' AND public.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (bucket_id = 'bar-media' AND public.has_role(auth.uid(), 'batonnier'));

DROP POLICY IF EXISTS "bar_media_authenticated_read" ON storage.objects;
CREATE POLICY "bar_media_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bar-media');

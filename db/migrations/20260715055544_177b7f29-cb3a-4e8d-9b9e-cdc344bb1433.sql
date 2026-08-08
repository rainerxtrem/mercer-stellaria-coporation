CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM public, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_lawyers()
RETURNS SETOF public.lawyers
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app_private.has_role(auth.uid(), 'batonnier') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT * FROM public.lawyers ORDER BY last_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_lawyers() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lawyers_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF app_private.has_role(auth.uid(), 'batonnier') THEN
    RETURN NEW;
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.lawyers_guard_self_update() FROM public, anon, authenticated;

ALTER POLICY "user_roles_select_own" ON public.user_roles
  USING ((user_id = auth.uid()) OR app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "user_roles_manage_admin" ON public.user_roles
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "profiles_select_own" ON public.profiles
  USING ((auth.uid() = id) OR app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "firms_admin_write" ON public.firms
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "lawyers_admin_write" ON public.lawyers
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "news_public_read_published" ON public.news
  USING ((status = 'published') OR app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "news_admin_write" ON public.news
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "libcat_admin_write" ON public.library_categories
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "libart_public_read" ON public.library_articles
  USING ((status = 'published') OR app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "libart_admin_write" ON public.library_articles
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "site_content_admin_write" ON public.site_content
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "audit_admin_read" ON public.audit_log
  USING (app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "audit_insert_admin" ON public.audit_log
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));
ALTER POLICY "bar_media_batonnier_all" ON storage.objects
  USING ((bucket_id = 'bar-media') AND app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK ((bucket_id = 'bar-media') AND app_private.has_role(auth.uid(), 'batonnier'));

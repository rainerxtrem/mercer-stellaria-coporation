-- 1) Remove anonymous direct access to lawyers PII
DROP POLICY IF EXISTS lawyers_anon_read ON public.lawyers;
REVOKE SELECT ON public.lawyers FROM anon;

CREATE OR REPLACE FUNCTION public.list_public_lawyers()
RETURNS TABLE(
  id uuid, license text, first_name text, last_name text, photo_url text,
  specialty text, city text, status license_status, admitted_on date,
  firm_id uuid, firm_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.license, l.first_name, l.last_name, l.photo_url, l.specialty,
         l.city, l.status, l.admitted_on, l.firm_id, f.name AS firm_name
  FROM public.lawyers l
  LEFT JOIN public.firms f ON f.id = l.firm_id
  ORDER BY l.last_name;
$$;

REVOKE ALL ON FUNCTION public.list_public_lawyers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_lawyers() TO anon, authenticated;

-- 2) Prevent firm managers from changing regulated lawyer fields via RLS
CREATE OR REPLACE FUNCTION app_private.lawyer_regulated_intact(
  _id uuid, _license text, _admitted_on date, _firm_id uuid,
  _profile_id uuid, _first_name text, _last_name text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lawyers l
    WHERE l.id = _id
      AND l.license IS NOT DISTINCT FROM _license
      AND l.admitted_on IS NOT DISTINCT FROM _admitted_on
      AND l.firm_id IS NOT DISTINCT FROM _firm_id
      AND l.profile_id IS NOT DISTINCT FROM _profile_id
      AND l.first_name IS NOT DISTINCT FROM _first_name
      AND l.last_name IS NOT DISTINCT FROM _last_name
  );
$$;

REVOKE ALL ON FUNCTION app_private.lawyer_regulated_intact(uuid, text, date, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.lawyer_regulated_intact(uuid, text, date, uuid, uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS cabinet_manager_update_firm_lawyers ON public.lawyers;
CREATE POLICY cabinet_manager_update_firm_lawyers
ON public.lawyers FOR UPDATE TO authenticated
USING (
  firm_id = app_private.get_user_firm_id(auth.uid())
  AND app_private.has_role(auth.uid(), 'responsable_cabinet'::app_role)
)
WITH CHECK (
  firm_id = app_private.get_user_firm_id(auth.uid())
  AND app_private.has_role(auth.uid(), 'responsable_cabinet'::app_role)
  AND app_private.lawyer_regulated_intact(id, license, admitted_on, firm_id, profile_id, first_name, last_name)
);

-- 3) Scope bar-media admin access away from private matter files
DROP POLICY IF EXISTS bar_media_batonnier_all ON storage.objects;

CREATE POLICY bar_media_batonnier_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'bar-media'
  AND (storage.foldername(name))[1] <> 'matters'
  AND app_private.has_role(auth.uid(), 'batonnier'::app_role)
);

CREATE POLICY bar_media_batonnier_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'bar-media'
  AND (storage.foldername(name))[1] <> 'matters'
  AND app_private.has_role(auth.uid(), 'batonnier'::app_role)
);

CREATE POLICY bar_media_batonnier_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'bar-media'
  AND (storage.foldername(name))[1] <> 'matters'
  AND app_private.has_role(auth.uid(), 'batonnier'::app_role)
)
WITH CHECK (
  bucket_id = 'bar-media'
  AND (storage.foldername(name))[1] <> 'matters'
  AND app_private.has_role(auth.uid(), 'batonnier'::app_role)
);

CREATE POLICY bar_media_batonnier_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'bar-media'
  AND (storage.foldername(name))[1] <> 'matters'
  AND app_private.has_role(auth.uid(), 'batonnier'::app_role)
);
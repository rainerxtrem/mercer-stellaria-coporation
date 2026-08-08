
-- Move can_access_matter into app_private (same pattern as has_role) so it's not on the public API surface.
CREATE OR REPLACE FUNCTION app_private.can_access_matter(_matter_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matters m
    WHERE m.id = _matter_id
      AND (m.owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'))
  );
$$;
REVOKE EXECUTE ON FUNCTION app_private.can_access_matter(UUID) FROM PUBLIC;

-- Rewrite policies that referenced public.can_access_matter
DROP POLICY matter_folders_access ON public.matter_folders;
CREATE POLICY matter_folders_access ON public.matter_folders FOR ALL TO authenticated
  USING (app_private.can_access_matter(matter_id))
  WITH CHECK (app_private.can_access_matter(matter_id));

DROP POLICY matter_documents_access ON public.matter_documents;
CREATE POLICY matter_documents_access ON public.matter_documents FOR ALL TO authenticated
  USING (app_private.can_access_matter(matter_id))
  WITH CHECK (app_private.can_access_matter(matter_id));

DROP POLICY matter_activity_read ON public.matter_activity;
CREATE POLICY matter_activity_read ON public.matter_activity FOR SELECT TO authenticated
  USING (app_private.can_access_matter(matter_id));
DROP POLICY matter_activity_insert ON public.matter_activity;
CREATE POLICY matter_activity_insert ON public.matter_activity FOR INSERT TO authenticated
  WITH CHECK (app_private.can_access_matter(matter_id) AND actor_id = auth.uid());

DROP POLICY bar_media_matters_select ON storage.objects;
DROP POLICY bar_media_matters_insert ON storage.objects;
DROP POLICY bar_media_matters_update ON storage.objects;
DROP POLICY bar_media_matters_delete ON storage.objects;

CREATE POLICY bar_media_matters_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bar-media'
    AND (storage.foldername(name))[1] = 'matters'
    AND app_private.can_access_matter(((storage.foldername(name))[2])::uuid)
  );
CREATE POLICY bar_media_matters_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bar-media'
    AND (storage.foldername(name))[1] = 'matters'
    AND app_private.can_access_matter(((storage.foldername(name))[2])::uuid)
  );
CREATE POLICY bar_media_matters_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bar-media'
    AND (storage.foldername(name))[1] = 'matters'
    AND app_private.can_access_matter(((storage.foldername(name))[2])::uuid)
  );
CREATE POLICY bar_media_matters_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'bar-media'
    AND (storage.foldername(name))[1] = 'matters'
    AND app_private.can_access_matter(((storage.foldername(name))[2])::uuid)
  );

DROP FUNCTION IF EXISTS public.can_access_matter(UUID);


-- 1) Restrict anon SELECT on public.lawyers to non-PII columns only
REVOKE SELECT ON public.lawyers FROM anon;
GRANT SELECT (id, profile_id, license, first_name, last_name, photo_url,
              firm_id, specialty, city, status, admitted_on, created_at, updated_at)
  ON public.lawyers TO anon;
-- authenticated keeps full select for admin flows (still gated by RLS + admin RPCs)
GRANT SELECT ON public.lawyers TO authenticated;

-- 2) Storage: scope bar-library reads to published articles only
DROP POLICY IF EXISTS bar_library_authenticated_read ON storage.objects;
CREATE POLICY bar_library_published_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bar-library'
    AND (
      app_private.has_role(auth.uid(), 'batonnier')
      OR EXISTS (
        SELECT 1 FROM public.library_articles a
        WHERE a.status = 'published'
          AND (storage.foldername(name))[1] = 'articles'
          AND (storage.foldername(name))[2] = a.id::text
      )
    )
  );

-- 3) Storage: ensure no broad authenticated-read policy exists on bar-media
DROP POLICY IF EXISTS bar_media_authenticated_read ON storage.objects;

-- 4) Lock down SECURITY DEFINER functions: revoke public execute; grant narrowly
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_lawyers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_bar_license() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bar_exam_recompute_total(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_disciplinary_decisions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_lawyer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_matter(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_firm_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_firm_stats(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_public_disciplinary_decisions() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_lawyer(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_lawyers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_matter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_firm_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_firm_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_exam_recompute_total(uuid) TO authenticated;
-- Trigger functions (handle_new_user, notify_*, audit_log_row, lawyers_guard_self_update,
-- matters_set_number, invoices_set_number, disciplinary_*_set_number,
-- disciplinary_apply_sanction, set_updated_at, next_bar_license) do not need
-- direct execute grants; they run in trigger context.


-- 1. Lawyers: hide PII columns from public/authenticated via column-level SELECT grants.
--    Batonnier reads sensitive fields through admin_list_lawyers (SECURITY DEFINER).
REVOKE SELECT ON public.lawyers FROM anon, authenticated;
GRANT SELECT (id, profile_id, license, first_name, last_name, photo_url, firm_id, specialty, city, status, admitted_on, created_at, updated_at)
  ON public.lawyers TO anon, authenticated;

-- Keep the public directory RLS policy (row visibility unchanged); column grants now hide email/phone/address/bio.

-- 2. Prevent lawyer self-escalation: drop the broad self-update policy.
--    The lawyers_guard_self_update trigger and admin_write policy still allow Batonnier edits.
DROP POLICY IF EXISTS lawyers_update_own ON public.lawyers;

-- 3. Storage: remove blanket authenticated read on bar-media; rely on matter-scoped policy + batonnier ALL.
DROP POLICY IF EXISTS bar_media_authenticated_read ON storage.objects;

-- 4. Revoke public execute on SECURITY DEFINER helper exposed via PostgREST.
--    RLS policies use app_private.has_role, so public.has_role is not needed by anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, PUBLIC;

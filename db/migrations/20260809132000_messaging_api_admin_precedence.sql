-- Keep the API pre-guard aligned with RLS when a corporate admin also carries
-- a client role: corporate administration takes precedence.

CREATE OR REPLACE FUNCTION app_private.can_access_api_target(_target_kind text, _target_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  module_slug text;
  active_firm_id uuid;
BEGIN
  IF _target_kind = 'table'
     AND _target_name = ANY (ARRAY[
       'public.client_conversations',
       'public.client_conversation_messages',
       'public.clients',
       'public.matter_messages'
     ])
  THEN
    active_firm_id := app_private.user_active_firm_id(auth.uid());

    IF app_private.has_role(auth.uid(), 'batonnier') THEN
      RETURN active_firm_id IS NOT NULL;
    END IF;

    IF app_private.has_role(auth.uid(), 'client') THEN
      RETURN EXISTS (
        SELECT 1 FROM public.enterprise_memberships membership
         WHERE membership.user_id = auth.uid()
           AND membership.status = 'active'
      );
    END IF;

    RETURN app_private.can_access_staff_messaging(auth.uid(), active_firm_id);
  END IF;

  SELECT target.module_slug
    INTO module_slug
    FROM public.enterprise_module_targets target
   WHERE target.target_kind = _target_kind
     AND (_target_name = target.target_name OR _target_name LIKE target.target_name || '%')
   ORDER BY length(target.target_name) DESC
   LIMIT 1;

  IF module_slug IS NULL THEN
    RETURN true;
  END IF;

  IF app_private.has_role(auth.uid(), 'client') THEN
    RETURN EXISTS (
      SELECT 1
        FROM public.enterprise_memberships membership
        LEFT JOIN public.enterprise_modules module
          ON module.firm_id = membership.firm_id
         AND module.module_slug = module_slug
       WHERE membership.user_id = auth.uid()
         AND membership.status = 'active'
         AND (module_slug = 'clients' OR module.enabled = true)
    );
  END IF;

  active_firm_id := app_private.user_active_firm_id(auth.uid());
  IF active_firm_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN app_private.user_has_module(auth.uid(), active_firm_id, module_slug);
END;
$$;

REVOKE ALL ON FUNCTION app_private.can_access_api_target(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_api_target(text, text) TO authenticated, service_role;

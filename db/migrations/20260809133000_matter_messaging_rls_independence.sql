-- Resolve matter-message authorization without subjecting the policy's matter
-- lookup to the optional Matters module RLS.

CREATE OR REPLACE FUNCTION app_private.can_access_matter_messaging(
  _user_id uuid,
  _matter_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matters matter
     WHERE matter.id = _matter_id
       AND (
         app_private.can_access_staff_messaging(_user_id, matter.firm_id)
         OR (
           app_private.has_role(_user_id, 'client')
           AND app_private.can_access_enterprise_messaging(_user_id, matter.firm_id)
           AND app_private.is_client_matter(matter.id, _user_id)
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION app_private.can_access_matter_messaging(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_matter_messaging(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS matter_messages_module_guard ON public.matter_messages;
CREATE POLICY matter_messages_module_guard ON public.matter_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_private.can_access_matter_messaging(auth.uid(), matter_id))
  WITH CHECK (app_private.can_access_matter_messaging(auth.uid(), matter_id));

DROP POLICY IF EXISTS matter_messages_active_firm_guard ON public.matter_messages;
CREATE POLICY matter_messages_active_firm_guard ON public.matter_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_private.can_access_matter_messaging(auth.uid(), matter_id))
  WITH CHECK (app_private.can_access_matter_messaging(auth.uid(), matter_id));

DROP POLICY IF EXISTS matter_messages_firm_all ON public.matter_messages;
CREATE POLICY matter_messages_firm_all ON public.matter_messages FOR ALL TO authenticated
  USING (app_private.can_access_matter_messaging(auth.uid(), matter_id))
  WITH CHECK (
    author_id = auth.uid()
    AND app_private.can_access_matter_messaging(auth.uid(), matter_id)
  );

-- Allow client API calls when the target module is enabled in at least one
-- enterprise to which the client is actively attached. Row-level policies
-- remain responsible for restricting access to the client's own records.

CREATE OR REPLACE FUNCTION app_private.can_access_api_target(_target_kind text, _target_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m_slug text;
  firm_id uuid;
BEGIN
  SELECT t.module_slug
    INTO m_slug
    FROM public.enterprise_module_targets t
   WHERE t.target_kind = _target_kind
     AND (_target_name = t.target_name OR _target_name LIKE t.target_name || '%')
   ORDER BY length(t.target_name) DESC
   LIMIT 1;

  IF m_slug IS NULL THEN
    RETURN true;
  END IF;

  IF app_private.has_role(auth.uid(), 'client') THEN
    RETURN EXISTS (
      SELECT 1
        FROM public.enterprise_memberships membership
        JOIN public.enterprise_modules module
          ON module.firm_id = membership.firm_id
         AND module.module_slug = m_slug
         AND module.enabled = true
       WHERE membership.user_id = auth.uid()
         AND membership.status = 'active'
    );
  END IF;

  firm_id := app_private.user_active_firm_id(auth.uid());
  IF firm_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN app_private.user_has_module(auth.uid(), firm_id, m_slug);
END;
$$;

REVOKE ALL ON FUNCTION app_private.can_access_api_target(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_api_target(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.client_has_firm_module(
  _user_id uuid,
  _firm_id uuid,
  _module_slug text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.has_role(_user_id, 'client')
     AND EXISTS (
       SELECT 1
         FROM public.enterprise_memberships membership
         JOIN public.enterprise_modules module
           ON module.firm_id = membership.firm_id
          AND module.module_slug = _module_slug
          AND module.enabled = true
        WHERE membership.user_id = _user_id
          AND membership.firm_id = _firm_id
          AND membership.status = 'active'
     );
$$;

REVOKE ALL ON FUNCTION app_private.client_has_firm_module(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.client_has_firm_module(uuid, uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS client_conversations_module_guard ON public.client_conversations;
CREATE POLICY client_conversations_module_guard ON public.client_conversations
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    app_private.user_has_active_module('messaging')
    OR app_private.client_has_firm_module(auth.uid(), firm_id, 'messaging')
  )
  WITH CHECK (
    app_private.user_has_active_module('messaging')
    OR app_private.client_has_firm_module(auth.uid(), firm_id, 'messaging')
  );

DROP POLICY IF EXISTS client_conversations_active_firm_guard ON public.client_conversations;
CREATE POLICY client_conversations_active_firm_guard ON public.client_conversations
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    app_private.is_active_firm(firm_id)
    OR app_private.client_has_firm_module(auth.uid(), firm_id, 'messaging')
  )
  WITH CHECK (
    app_private.is_active_firm(firm_id)
    OR app_private.client_has_firm_module(auth.uid(), firm_id, 'messaging')
  );

DROP POLICY IF EXISTS client_conversation_messages_module_guard ON public.client_conversation_messages;
CREATE POLICY client_conversation_messages_module_guard ON public.client_conversation_messages
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    app_private.user_has_active_module('messaging')
    OR EXISTS (
      SELECT 1
        FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND app_private.client_has_firm_module(auth.uid(), conversation.firm_id, 'messaging')
    )
  )
  WITH CHECK (
    app_private.user_has_active_module('messaging')
    OR EXISTS (
      SELECT 1
        FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND app_private.client_has_firm_module(auth.uid(), conversation.firm_id, 'messaging')
    )
  );

DROP POLICY IF EXISTS client_conv_messages_active_firm_guard ON public.client_conversation_messages;
CREATE POLICY client_conv_messages_active_firm_guard ON public.client_conversation_messages
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND (
           app_private.is_active_firm(conversation.firm_id)
           OR app_private.client_has_firm_module(auth.uid(), conversation.firm_id, 'messaging')
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND (
           app_private.is_active_firm(conversation.firm_id)
           OR app_private.client_has_firm_module(auth.uid(), conversation.firm_id, 'messaging')
         )
    )
  );

DROP POLICY IF EXISTS client_conversations_client_insert ON public.client_conversations;
CREATE POLICY client_conversations_client_insert ON public.client_conversations FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'client')
    AND created_by = auth.uid()
    AND app_private.is_client_profile(client_id, auth.uid())
    AND app_private.client_has_firm_module(auth.uid(), firm_id, 'messaging')
  );

DROP POLICY IF EXISTS matter_messages_module_guard ON public.matter_messages;
CREATE POLICY matter_messages_module_guard ON public.matter_messages
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    app_private.user_has_active_module('messaging')
    OR EXISTS (
      SELECT 1
        FROM public.matters matter
       WHERE matter.id = matter_id
         AND app_private.client_has_firm_module(auth.uid(), matter.firm_id, 'messaging')
         AND app_private.is_client_matter(matter.id, auth.uid())
    )
  )
  WITH CHECK (
    app_private.user_has_active_module('messaging')
    OR EXISTS (
      SELECT 1
        FROM public.matters matter
       WHERE matter.id = matter_id
         AND app_private.client_has_firm_module(auth.uid(), matter.firm_id, 'messaging')
         AND app_private.is_client_matter(matter.id, auth.uid())
    )
  );

-- Existing and future client memberships receive the site's client grade.
INSERT INTO public.enterprise_member_grades (membership_id, grade_id)
SELECT membership.id, grade.id
  FROM public.enterprise_memberships membership
  JOIN public.user_roles role
    ON role.user_id = membership.user_id
   AND role.role = 'client'
  JOIN public.enterprise_grades grade
    ON grade.firm_id = membership.firm_id
   AND grade.code = 'client'
 WHERE membership.status = 'active'
ON CONFLICT DO NOTHING;

-- Conversation attachments are isolated by conversation membership and firm.
DROP POLICY IF EXISTS bar_media_client_conversation_read ON storage.objects;
CREATE POLICY bar_media_client_conversation_read ON storage.objects FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'client')
    AND bucket_id = 'bar-media'
    AND name LIKE 'conversations/%'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
        FROM public.client_conversations conversation
       WHERE conversation.id = NULLIF(split_part(name, '/', 2), '')::uuid
         AND app_private.is_client_profile(conversation.client_id, auth.uid())
         AND app_private.client_has_firm_module(auth.uid(), conversation.firm_id, 'messaging')
    )
  );

DROP POLICY IF EXISTS bar_media_client_conversation_insert ON storage.objects;
CREATE POLICY bar_media_client_conversation_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'client')
    AND bucket_id = 'bar-media'
    AND name LIKE 'conversations/%'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
        FROM public.client_conversations conversation
       WHERE conversation.id = NULLIF(split_part(name, '/', 2), '')::uuid
         AND app_private.is_client_profile(conversation.client_id, auth.uid())
         AND app_private.client_has_firm_module(auth.uid(), conversation.firm_id, 'messaging')
    )
  );
-- Make enterprise messaging independent from optional module grants while
-- retaining strict firm isolation and client ownership checks.

CREATE OR REPLACE FUNCTION app_private.user_active_firm_id(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims_text text;
  claims_json jsonb;
  claimed_firm uuid;
  fallback_firm uuid;
  corporate_admin boolean;
BEGIN
  corporate_admin := app_private.has_role(_user_id, 'batonnier');
  claims_text := current_setting('request.jwt.claims', true);

  IF claims_text IS NOT NULL AND length(claims_text) > 0 THEN
    claims_json := claims_text::jsonb;
    IF _user_id = auth.uid() THEN
      BEGIN
        claimed_firm := NULLIF(claims_json->>'firm_id', '')::uuid;
      EXCEPTION WHEN others THEN
        claimed_firm := NULL;
      END;

      IF claimed_firm IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.firms f WHERE f.id = claimed_firm AND f.status = 'active')
         AND (
           corporate_admin
           OR EXISTS (
             SELECT 1 FROM public.enterprise_memberships m
              WHERE m.user_id = _user_id
                AND m.firm_id = claimed_firm
                AND m.status = 'active'
           )
         )
      THEN
        RETURN claimed_firm;
      END IF;
    END IF;
  END IF;

  SELECT p.active_firm_id INTO fallback_firm
    FROM public.profiles p
   WHERE p.id = _user_id;

  IF fallback_firm IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.firms f WHERE f.id = fallback_firm AND f.status = 'active')
     AND (
       corporate_admin
       OR EXISTS (
         SELECT 1 FROM public.enterprise_memberships m
          WHERE m.user_id = _user_id
            AND m.firm_id = fallback_firm
            AND m.status = 'active'
       )
     )
  THEN
    RETURN fallback_firm;
  END IF;

  SELECT m.firm_id INTO fallback_firm
    FROM public.enterprise_memberships m
   WHERE m.user_id = _user_id
     AND m.status = 'active'
   ORDER BY m.is_default DESC, m.created_at ASC
   LIMIT 1;

  IF fallback_firm IS NOT NULL THEN
    RETURN fallback_firm;
  END IF;

  SELECT l.firm_id INTO fallback_firm
    FROM public.lawyers l
   WHERE l.profile_id = _user_id
   LIMIT 1;

  RETURN fallback_firm;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_enterprise_messaging(_user_id uuid, _firm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _firm_id IS NOT NULL
     AND (
       app_private.has_role(_user_id, 'batonnier')
       OR EXISTS (
         SELECT 1 FROM public.enterprise_memberships membership
          WHERE membership.user_id = _user_id
            AND membership.firm_id = _firm_id
            AND membership.status = 'active'
       )
     );
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_staff_messaging(_user_id uuid, _firm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT app_private.has_role(_user_id, 'client')
     AND app_private.can_access_enterprise_messaging(_user_id, _firm_id);
$$;

REVOKE ALL ON FUNCTION app_private.user_active_firm_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_access_enterprise_messaging(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_access_staff_messaging(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.user_active_firm_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_enterprise_messaging(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_staff_messaging(uuid, uuid) TO authenticated, service_role;

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
    IF app_private.has_role(auth.uid(), 'client') THEN
      RETURN EXISTS (
        SELECT 1 FROM public.enterprise_memberships membership
         WHERE membership.user_id = auth.uid()
           AND membership.status = 'active'
      );
    END IF;

    active_firm_id := app_private.user_active_firm_id(auth.uid());
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

DROP POLICY IF EXISTS client_conversations_module_guard ON public.client_conversations;
CREATE POLICY client_conversations_module_guard ON public.client_conversations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (app_private.can_access_enterprise_messaging(auth.uid(), firm_id))
  WITH CHECK (app_private.can_access_enterprise_messaging(auth.uid(), firm_id));

DROP POLICY IF EXISTS client_conversations_active_firm_guard ON public.client_conversations;
CREATE POLICY client_conversations_active_firm_guard ON public.client_conversations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    app_private.is_active_firm(firm_id)
    OR (
      app_private.has_role(auth.uid(), 'client')
      AND app_private.can_access_enterprise_messaging(auth.uid(), firm_id)
    )
  )
  WITH CHECK (
    app_private.is_active_firm(firm_id)
    OR (
      app_private.has_role(auth.uid(), 'client')
      AND app_private.can_access_enterprise_messaging(auth.uid(), firm_id)
    )
  );

DROP POLICY IF EXISTS client_conversations_staff_all ON public.client_conversations;
CREATE POLICY client_conversations_staff_all ON public.client_conversations FOR ALL TO authenticated
  USING (app_private.can_access_staff_messaging(auth.uid(), firm_id))
  WITH CHECK (app_private.can_access_staff_messaging(auth.uid(), firm_id));

DROP POLICY IF EXISTS client_conversation_messages_module_guard ON public.client_conversation_messages;
CREATE POLICY client_conversation_messages_module_guard ON public.client_conversation_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND app_private.can_access_enterprise_messaging(auth.uid(), conversation.firm_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND app_private.can_access_enterprise_messaging(auth.uid(), conversation.firm_id)
    )
  );

DROP POLICY IF EXISTS client_conv_messages_active_firm_guard ON public.client_conversation_messages;
CREATE POLICY client_conv_messages_active_firm_guard ON public.client_conversation_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND (
           app_private.is_active_firm(conversation.firm_id)
           OR (
             app_private.has_role(auth.uid(), 'client')
             AND app_private.can_access_enterprise_messaging(auth.uid(), conversation.firm_id)
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND (
           app_private.is_active_firm(conversation.firm_id)
           OR (
             app_private.has_role(auth.uid(), 'client')
             AND app_private.can_access_enterprise_messaging(auth.uid(), conversation.firm_id)
           )
         )
    )
  );

DROP POLICY IF EXISTS client_conv_messages_staff_all ON public.client_conversation_messages;
CREATE POLICY client_conv_messages_staff_all ON public.client_conversation_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND app_private.can_access_staff_messaging(auth.uid(), conversation.firm_id)
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.client_conversations conversation
       WHERE conversation.id = conversation_id
         AND app_private.can_access_staff_messaging(auth.uid(), conversation.firm_id)
    )
  );

-- Staff may resolve client display data for messaging even without the optional
-- Clients module. Existing permissive policies and active-firm guard still apply.
DROP POLICY IF EXISTS clients_module_guard ON public.clients;
CREATE POLICY clients_module_guard ON public.clients
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    app_private.user_has_active_module('clients')
    OR app_private.can_access_staff_messaging(auth.uid(), firm_id)
    OR (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid())
  )
  WITH CHECK (
    app_private.user_has_active_module('clients')
    OR app_private.can_access_staff_messaging(auth.uid(), firm_id)
    OR (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid())
  );

DROP POLICY IF EXISTS clients_messaging_select ON public.clients;
CREATE POLICY clients_messaging_select ON public.clients FOR SELECT TO authenticated
  USING (app_private.can_access_staff_messaging(auth.uid(), firm_id));

DROP POLICY IF EXISTS matter_messages_module_guard ON public.matter_messages;
CREATE POLICY matter_messages_module_guard ON public.matter_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND (
           app_private.can_access_staff_messaging(auth.uid(), matter.firm_id)
           OR (
             app_private.has_role(auth.uid(), 'client')
             AND app_private.can_access_enterprise_messaging(auth.uid(), matter.firm_id)
             AND app_private.is_client_matter(matter.id, auth.uid())
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND (
           app_private.can_access_staff_messaging(auth.uid(), matter.firm_id)
           OR (
             app_private.has_role(auth.uid(), 'client')
             AND app_private.can_access_enterprise_messaging(auth.uid(), matter.firm_id)
             AND app_private.is_client_matter(matter.id, auth.uid())
           )
         )
    )
  );

DROP POLICY IF EXISTS matter_messages_active_firm_guard ON public.matter_messages;
CREATE POLICY matter_messages_active_firm_guard ON public.matter_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND (
           app_private.is_active_firm(matter.firm_id)
           OR (
             app_private.has_role(auth.uid(), 'client')
             AND app_private.can_access_enterprise_messaging(auth.uid(), matter.firm_id)
             AND app_private.is_client_matter(matter.id, auth.uid())
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND (
           app_private.is_active_firm(matter.firm_id)
           OR (
             app_private.has_role(auth.uid(), 'client')
             AND app_private.can_access_enterprise_messaging(auth.uid(), matter.firm_id)
             AND app_private.is_client_matter(matter.id, auth.uid())
           )
         )
    )
  );

DROP POLICY IF EXISTS matter_messages_firm_all ON public.matter_messages;
CREATE POLICY matter_messages_firm_all ON public.matter_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND app_private.can_access_staff_messaging(auth.uid(), matter.firm_id)
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND app_private.can_access_staff_messaging(auth.uid(), matter.firm_id)
    )
  );

CREATE OR REPLACE FUNCTION app_private.list_enterprise_messaging_matters(
  _user_id uuid,
  _firm_id uuid
)
RETURNS TABLE (
  id uuid,
  number text,
  title text,
  client_id uuid,
  client_first_name text,
  client_last_name text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     OR _firm_id IS DISTINCT FROM app_private.user_active_firm_id(auth.uid())
     OR NOT app_private.can_access_staff_messaging(auth.uid(), _firm_id)
  THEN
    RAISE EXCEPTION 'Enterprise messaging access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT matter.id,
         matter.number,
         matter.title,
         matter.client_id,
         client.first_name,
         client.last_name,
         matter.updated_at
    FROM public.matters matter
    LEFT JOIN public.clients client ON client.id = matter.client_id
   WHERE matter.firm_id = _firm_id
     AND matter.status <> 'archived'
   ORDER BY matter.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION app_private.list_enterprise_messaging_matters(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.list_enterprise_messaging_matters(uuid, uuid) TO authenticated, service_role;

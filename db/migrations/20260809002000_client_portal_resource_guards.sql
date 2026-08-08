-- Client portal resources must not depend on the staff active-firm selector.
-- Existing permissive client policies still enforce ownership; these restrictive
-- guards additionally require an active enterprise membership and enabled module.

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
  SELECT target.module_slug
    INTO m_slug
    FROM public.enterprise_module_targets target
   WHERE target.target_kind = _target_kind
     AND (_target_name = target.target_name OR _target_name LIKE target.target_name || '%')
   ORDER BY length(target.target_name) DESC
   LIMIT 1;

  IF m_slug IS NULL THEN
    RETURN true;
  END IF;

  IF app_private.has_role(auth.uid(), 'client') THEN
    RETURN EXISTS (
      SELECT 1
        FROM public.enterprise_memberships membership
        LEFT JOIN public.enterprise_modules module
          ON module.firm_id = membership.firm_id
         AND module.module_slug = m_slug
       WHERE membership.user_id = auth.uid()
         AND membership.status = 'active'
         AND (m_slug = 'clients' OR module.enabled = true)
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

DROP POLICY IF EXISTS clients_module_guard ON public.clients;
CREATE POLICY clients_module_guard ON public.clients
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    app_private.user_has_active_module('clients')
    OR (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid())
  )
  WITH CHECK (
    app_private.user_has_active_module('clients')
    OR (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid())
  );

DROP POLICY IF EXISTS clients_active_firm_guard ON public.clients;
CREATE POLICY clients_active_firm_guard ON public.clients
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    app_private.is_active_firm(firm_id)
    OR (
      app_private.has_role(auth.uid(), 'client')
      AND profile_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.enterprise_memberships membership
         WHERE membership.user_id = auth.uid()
           AND membership.firm_id = firm_id
           AND membership.status = 'active'
      )
    )
  )
  WITH CHECK (
    app_private.is_active_firm(firm_id)
    OR (
      app_private.has_role(auth.uid(), 'client')
      AND profile_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.enterprise_memberships membership
         WHERE membership.user_id = auth.uid()
           AND membership.firm_id = firm_id
           AND membership.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS matters_module_guard ON public.matters;
CREATE POLICY matters_module_guard ON public.matters
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    app_private.user_has_active_module('matters')
    OR (
      app_private.client_has_firm_module(auth.uid(), firm_id, 'matters')
      AND app_private.is_client_matter(id, auth.uid())
    )
  )
  WITH CHECK (
    app_private.user_has_active_module('matters')
    OR (
      app_private.client_has_firm_module(auth.uid(), firm_id, 'matters')
      AND app_private.is_client_matter(id, auth.uid())
    )
  );

DROP POLICY IF EXISTS matters_active_firm_guard ON public.matters;
CREATE POLICY matters_active_firm_guard ON public.matters
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    app_private.is_active_firm(firm_id)
    OR (
      app_private.client_has_firm_module(auth.uid(), firm_id, 'matters')
      AND app_private.is_client_matter(id, auth.uid())
    )
  )
  WITH CHECK (
    app_private.is_active_firm(firm_id)
    OR (
      app_private.client_has_firm_module(auth.uid(), firm_id, 'matters')
      AND app_private.is_client_matter(id, auth.uid())
    )
  );

DROP POLICY IF EXISTS matter_documents_module_guard ON public.matter_documents;
CREATE POLICY matter_documents_module_guard ON public.matter_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    app_private.user_has_active_module('documents')
    OR EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND app_private.client_has_firm_module(auth.uid(), matter.firm_id, 'documents')
         AND app_private.is_client_matter(matter.id, auth.uid())
    )
  )
  WITH CHECK (
    app_private.user_has_active_module('documents')
    OR EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND app_private.client_has_firm_module(auth.uid(), matter.firm_id, 'documents')
         AND app_private.is_client_matter(matter.id, auth.uid())
    )
  );

DROP POLICY IF EXISTS matter_documents_active_firm_guard ON public.matter_documents;
CREATE POLICY matter_documents_active_firm_guard ON public.matter_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND (
           app_private.is_active_firm(matter.firm_id)
           OR (
             app_private.client_has_firm_module(auth.uid(), matter.firm_id, 'documents')
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
             app_private.client_has_firm_module(auth.uid(), matter.firm_id, 'documents')
             AND app_private.is_client_matter(matter.id, auth.uid())
           )
         )
    )
  );

DROP POLICY IF EXISTS matter_activity_active_firm_guard ON public.matter_activity;
CREATE POLICY matter_activity_active_firm_guard ON public.matter_activity
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matters matter
       WHERE matter.id = matter_id
         AND (
           app_private.is_active_firm(matter.firm_id)
           OR (
             app_private.client_has_firm_module(auth.uid(), matter.firm_id, 'matters')
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
             app_private.client_has_firm_module(auth.uid(), matter.firm_id, 'matters')
             AND app_private.is_client_matter(matter.id, auth.uid())
           )
         )
    )
  );

DROP POLICY IF EXISTS invoices_module_guard ON public.invoices;
CREATE POLICY invoices_module_guard ON public.invoices
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    CASE WHEN kind = 'quote'
      THEN app_private.user_has_active_module('quotes')
        OR (app_private.client_has_firm_module(auth.uid(), firm_id, 'quotes') AND app_private.is_client_invoice(id, auth.uid()))
      ELSE app_private.user_has_active_module('billing')
        OR (app_private.client_has_firm_module(auth.uid(), firm_id, 'billing') AND app_private.is_client_invoice(id, auth.uid()))
    END
  )
  WITH CHECK (
    CASE WHEN kind = 'quote'
      THEN app_private.user_has_active_module('quotes')
        OR (app_private.client_has_firm_module(auth.uid(), firm_id, 'quotes') AND app_private.is_client_invoice(id, auth.uid()))
      ELSE app_private.user_has_active_module('billing')
        OR (app_private.client_has_firm_module(auth.uid(), firm_id, 'billing') AND app_private.is_client_invoice(id, auth.uid()))
    END
  );

DROP POLICY IF EXISTS invoices_active_firm_guard ON public.invoices;
CREATE POLICY invoices_active_firm_guard ON public.invoices
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    app_private.is_active_firm(firm_id)
    OR (
      app_private.is_client_invoice(id, auth.uid())
      AND (
        (kind = 'quote' AND app_private.client_has_firm_module(auth.uid(), firm_id, 'quotes'))
        OR (kind <> 'quote' AND app_private.client_has_firm_module(auth.uid(), firm_id, 'billing'))
      )
    )
  )
  WITH CHECK (
    app_private.is_active_firm(firm_id)
    OR (
      app_private.is_client_invoice(id, auth.uid())
      AND (
        (kind = 'quote' AND app_private.client_has_firm_module(auth.uid(), firm_id, 'quotes'))
        OR (kind <> 'quote' AND app_private.client_has_firm_module(auth.uid(), firm_id, 'billing'))
      )
    )
  );
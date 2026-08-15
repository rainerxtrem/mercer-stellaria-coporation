-- Shared client registry across all enterprises.
-- Matters remain firm-scoped; clients are global and can be reused across companies.

ALTER TABLE public.clients
  ALTER COLUMN firm_id DROP NOT NULL;

UPDATE public.clients
SET firm_id = NULL
WHERE firm_id IS NOT NULL;

DROP TRIGGER IF EXISTS clients_assign_firm_trg ON public.clients;

-- The legacy trigger used to pin a client to the active enterprise. Clients are now
-- shared records and must not be forced into a single entity.
CREATE OR REPLACE FUNCTION app_private.assign_client_firm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.firm_id := NULL;
  RETURN NEW;
END;
$$;

-- Shared clients are visible to any authenticated staff member with access to the
-- clients module and a valid active membership, while a client can still access its own profile.
DROP POLICY IF EXISTS clients_module_guard ON public.clients;
CREATE POLICY clients_module_guard ON public.clients
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid())
    OR (
      app_private.user_has_active_module('clients')
      AND EXISTS (
        SELECT 1
        FROM public.enterprise_memberships membership
        WHERE membership.user_id = auth.uid()
          AND membership.status = 'active'
      )
    )
  )
  WITH CHECK (
    (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid())
    OR (
      app_private.user_has_active_module('clients')
      AND EXISTS (
        SELECT 1
        FROM public.enterprise_memberships membership
        WHERE membership.user_id = auth.uid()
          AND membership.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS clients_active_firm_guard ON public.clients;
CREATE POLICY clients_active_firm_guard ON public.clients
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid())
    OR (
      app_private.user_has_active_module('clients')
      AND EXISTS (
        SELECT 1
        FROM public.enterprise_memberships membership
        WHERE membership.user_id = auth.uid()
          AND membership.status = 'active'
      )
    )
  )
  WITH CHECK (
    (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid())
    OR (
      app_private.user_has_active_module('clients')
      AND EXISTS (
        SELECT 1
        FROM public.enterprise_memberships membership
        WHERE membership.user_id = auth.uid()
          AND membership.status = 'active'
      )
    )
  );

-- Keep the existing per-enterprise matter scoping untouched: dossiers remain isolated
-- by firm_id, but the underlying client registry is shared across all firms.

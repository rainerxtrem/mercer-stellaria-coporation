-- Ensure the firm helper is callable from RLS policies by authenticated users
CREATE OR REPLACE FUNCTION public.get_my_firm_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT firm_id
  FROM public.lawyers
  WHERE profile_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_firm_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_firm_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_firm_id() TO service_role;

-- Security-definer helpers used by RLS to avoid recursive user_roles/lawyers checks
CREATE OR REPLACE FUNCTION app_private.get_user_firm_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT firm_id
  FROM public.lawyers
  WHERE profile_id = _user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_private.users_share_firm(_actor_id uuid, _target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lawyers actor_lawyer
    JOIN public.lawyers target_lawyer
      ON target_lawyer.firm_id = actor_lawyer.firm_id
    WHERE actor_lawyer.profile_id = _actor_id
      AND target_lawyer.profile_id = _target_id
      AND actor_lawyer.firm_id IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION app_private.get_user_firm_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.users_share_firm(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.get_user_firm_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.get_user_firm_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.users_share_firm(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.users_share_firm(uuid, uuid) TO service_role;

-- Rebuild policies that use get_my_firm_id with explicit, non-recursive helpers
DROP POLICY IF EXISTS firm_pricing_select ON public.firm_pricing;
DROP POLICY IF EXISTS firm_pricing_insert ON public.firm_pricing;
DROP POLICY IF EXISTS firm_pricing_update ON public.firm_pricing;
DROP POLICY IF EXISTS firm_pricing_delete ON public.firm_pricing;

CREATE POLICY firm_pricing_select
ON public.firm_pricing
FOR SELECT
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'batonnier')
  OR firm_id = public.get_my_firm_id()
);

CREATE POLICY firm_pricing_insert
ON public.firm_pricing
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = public.get_my_firm_id()
  )
);

CREATE POLICY firm_pricing_update
ON public.firm_pricing
FOR UPDATE
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = public.get_my_firm_id()
  )
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = public.get_my_firm_id()
  )
);

CREATE POLICY firm_pricing_delete
ON public.firm_pricing
FOR DELETE
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = public.get_my_firm_id()
  )
);

DROP POLICY IF EXISTS cabinet_manager_update_own_firm ON public.firms;
CREATE POLICY cabinet_manager_update_own_firm
ON public.firms
FOR UPDATE
TO authenticated
USING (
  id = public.get_my_firm_id()
  AND app_private.has_role(auth.uid(), 'responsable_cabinet')
)
WITH CHECK (
  id = public.get_my_firm_id()
  AND app_private.has_role(auth.uid(), 'responsable_cabinet')
);

DROP POLICY IF EXISTS cabinet_manager_update_firm_lawyers ON public.lawyers;
CREATE POLICY cabinet_manager_update_firm_lawyers
ON public.lawyers
FOR UPDATE
TO authenticated
USING (
  firm_id = public.get_my_firm_id()
  AND app_private.has_role(auth.uid(), 'responsable_cabinet')
)
WITH CHECK (
  firm_id = public.get_my_firm_id()
  AND app_private.has_role(auth.uid(), 'responsable_cabinet')
);

-- Consolidate user role RLS: own read, Bâtonnier full, firm director limited to own firm members
DROP POLICY IF EXISTS user_roles_manage_admin ON public.user_roles;
DROP POLICY IF EXISTS batonnier_manage_user_roles_delete ON public.user_roles;
DROP POLICY IF EXISTS batonnier_manage_user_roles_insert ON public.user_roles;
DROP POLICY IF EXISTS batonnier_read_all_user_roles ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_director_read_firm ON public.user_roles;
DROP POLICY IF EXISTS user_roles_director_insert_firm ON public.user_roles;
DROP POLICY IF EXISTS user_roles_director_delete_firm ON public.user_roles;

CREATE POLICY user_roles_select_scoped
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND app_private.users_share_firm(auth.uid(), user_id)
  )
);

CREATE POLICY user_roles_insert_scoped
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND role IN ('avocat', 'assistant', 'citoyen')
    AND app_private.users_share_firm(auth.uid(), user_id)
  )
);

CREATE POLICY user_roles_delete_scoped
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND role IN ('avocat', 'assistant', 'citoyen')
    AND app_private.users_share_firm(auth.uid(), user_id)
  )
);
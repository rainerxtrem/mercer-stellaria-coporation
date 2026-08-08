-- The public helper remains callable, but no longer runs with elevated privileges.
-- Sensitive RLS checks use app_private.get_user_firm_id(auth.uid()) instead.
CREATE OR REPLACE FUNCTION public.get_my_firm_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
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
  OR firm_id = app_private.get_user_firm_id(auth.uid())
);

CREATE POLICY firm_pricing_insert
ON public.firm_pricing
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = app_private.get_user_firm_id(auth.uid())
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
    AND firm_id = app_private.get_user_firm_id(auth.uid())
  )
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = app_private.get_user_firm_id(auth.uid())
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
    AND firm_id = app_private.get_user_firm_id(auth.uid())
  )
);

DROP POLICY IF EXISTS cabinet_manager_update_own_firm ON public.firms;
CREATE POLICY cabinet_manager_update_own_firm
ON public.firms
FOR UPDATE
TO authenticated
USING (
  id = app_private.get_user_firm_id(auth.uid())
  AND app_private.has_role(auth.uid(), 'responsable_cabinet')
)
WITH CHECK (
  id = app_private.get_user_firm_id(auth.uid())
  AND app_private.has_role(auth.uid(), 'responsable_cabinet')
);

DROP POLICY IF EXISTS cabinet_manager_update_firm_lawyers ON public.lawyers;
CREATE POLICY cabinet_manager_update_firm_lawyers
ON public.lawyers
FOR UPDATE
TO authenticated
USING (
  firm_id = app_private.get_user_firm_id(auth.uid())
  AND app_private.has_role(auth.uid(), 'responsable_cabinet')
)
WITH CHECK (
  firm_id = app_private.get_user_firm_id(auth.uid())
  AND app_private.has_role(auth.uid(), 'responsable_cabinet')
);
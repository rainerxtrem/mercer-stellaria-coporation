-- Prevent client users from inheriting staff-level firm-wide access.
-- Clients must only access resources granted by dedicated client policies.

CREATE OR REPLACE FUNCTION app_private.can_access_owned(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _owner_id = auth.uid()
      OR (
        NOT app_private.has_role(auth.uid(), 'client')
        AND (
          app_private.has_role(auth.uid(), 'batonnier')
          OR app_private.users_share_firm(auth.uid(), _owner_id)
        )
      );
$$;

REVOKE ALL ON FUNCTION app_private.can_access_owned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_owned(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.can_delete_owned(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _owner_id = auth.uid()
      OR (
        NOT app_private.has_role(auth.uid(), 'client')
        AND (
          app_private.has_role(auth.uid(), 'batonnier')
          OR (
            app_private.has_role(auth.uid(), 'responsable_cabinet')
            AND app_private.users_share_firm(auth.uid(), _owner_id)
          )
        )
      );
$$;

REVOKE ALL ON FUNCTION app_private.can_delete_owned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_delete_owned(uuid) TO authenticated;

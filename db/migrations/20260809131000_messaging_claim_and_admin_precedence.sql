-- Reject an explicitly selected unauthorized firm instead of silently falling
-- back to another firm, and let the corporate admin role override client roles.

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
    IF _user_id = auth.uid() AND claims_json ? 'firm_id' THEN
      BEGIN
        claimed_firm := NULLIF(claims_json->>'firm_id', '')::uuid;
      EXCEPTION WHEN others THEN
        RETURN NULL;
      END;

      IF claimed_firm IS NULL THEN
        RETURN NULL;
      END IF;

      IF EXISTS (SELECT 1 FROM public.firms firm WHERE firm.id = claimed_firm AND firm.status = 'active')
         AND (
           corporate_admin
           OR EXISTS (
             SELECT 1 FROM public.enterprise_memberships membership
              WHERE membership.user_id = _user_id
                AND membership.firm_id = claimed_firm
                AND membership.status = 'active'
           )
         )
      THEN
        RETURN claimed_firm;
      END IF;

      RETURN NULL;
    END IF;
  END IF;

  SELECT profile.active_firm_id INTO fallback_firm
    FROM public.profiles profile
   WHERE profile.id = _user_id;

  IF fallback_firm IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.firms firm WHERE firm.id = fallback_firm AND firm.status = 'active')
     AND (
       corporate_admin
       OR EXISTS (
         SELECT 1 FROM public.enterprise_memberships membership
          WHERE membership.user_id = _user_id
            AND membership.firm_id = fallback_firm
            AND membership.status = 'active'
       )
     )
  THEN
    RETURN fallback_firm;
  END IF;

  SELECT membership.firm_id INTO fallback_firm
    FROM public.enterprise_memberships membership
   WHERE membership.user_id = _user_id
     AND membership.status = 'active'
   ORDER BY membership.is_default DESC, membership.created_at ASC
   LIMIT 1;

  IF fallback_firm IS NOT NULL THEN
    RETURN fallback_firm;
  END IF;

  SELECT lawyer.firm_id INTO fallback_firm
    FROM public.lawyers lawyer
   WHERE lawyer.profile_id = _user_id
   LIMIT 1;

  RETURN fallback_firm;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_staff_messaging(_user_id uuid, _firm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.has_role(_user_id, 'batonnier')
      OR (
        NOT app_private.has_role(_user_id, 'client')
        AND app_private.can_access_enterprise_messaging(_user_id, _firm_id)
      );
$$;

REVOKE ALL ON FUNCTION app_private.user_active_firm_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_access_staff_messaging(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.user_active_firm_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_staff_messaging(uuid, uuid) TO authenticated, service_role;

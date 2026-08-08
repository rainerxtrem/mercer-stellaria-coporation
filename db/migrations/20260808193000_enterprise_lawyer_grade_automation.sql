-- Automatisation metier du grade Avocat au niveau base de donnees.
-- Cette migration garantit la creation/maintien du profil avocat et
-- l'activation/retrait des acces via grades de facon immediate et centralisee.

CREATE UNIQUE INDEX IF NOT EXISTS lawyers_profile_firm_unique_idx
  ON public.lawyers(profile_id, firm_id)
  WHERE profile_id IS NOT NULL AND firm_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.is_lawyer_grade(_grade_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_grades g
    WHERE g.id = _grade_id
      AND (
        lower(g.code) = 'lawyer'
        OR lower(g.name) = 'avocat'
        OR lower(g.name) = 'lawyer'
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.ensure_lawyer_grade_defaults(_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_lawyer boolean;
BEGIN
  SELECT app_private.is_lawyer_grade(_grade_id) INTO is_lawyer;
  IF NOT is_lawyer THEN
    RETURN;
  END IF;

  INSERT INTO public.enterprise_grade_modules (grade_id, module_slug, allowed)
  SELECT _grade_id, m.slug, true
  FROM public.enterprise_module_catalog m
  WHERE m.slug IN (
    'dashboard',
    'matters',
    'clients',
    'documents',
    'document_generator',
    'quotes',
    'billing',
    'signature',
    'messaging',
    'tasks',
    'library',
    'trainings',
    'exams'
  )
  ON CONFLICT (grade_id, module_slug)
  DO UPDATE SET allowed = EXCLUDED.allowed;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.sync_lawyer_profile_for_membership(_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  membership_row public.enterprise_memberships%ROWTYPE;
  should_have_lawyer boolean;
  has_any_lawyer_grade boolean;
  existing_lawyer_id uuid;
  profile_name text;
  profile_email text;
  inferred_first_name text;
  inferred_last_name text;
  generated_license text;
BEGIN
  SELECT *
    INTO membership_row
    FROM public.enterprise_memberships m
   WHERE m.id = _membership_id;

  IF membership_row.id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_member_grades mg
    JOIN public.enterprise_grades g ON g.id = mg.grade_id
    WHERE mg.membership_id = membership_row.id
      AND (
        lower(g.code) = 'lawyer'
        OR lower(g.name) = 'avocat'
        OR lower(g.name) = 'lawyer'
      )
  )
  INTO should_have_lawyer;

  should_have_lawyer := should_have_lawyer AND membership_row.status = 'active';

  IF should_have_lawyer THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (membership_row.user_id, 'avocat'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    SELECT l.id
      INTO existing_lawyer_id
      FROM public.lawyers l
     WHERE l.profile_id = membership_row.user_id
       AND l.firm_id = membership_row.firm_id
     LIMIT 1;

    SELECT p.full_name, u.email
      INTO profile_name, profile_email
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
     WHERE p.id = membership_row.user_id;

    inferred_first_name := NULLIF(trim(split_part(COALESCE(profile_name, ''), ' ', 1)), '');
    inferred_last_name := NULLIF(trim(regexp_replace(COALESCE(profile_name, ''), '^\S+\s*', '')), '');

    IF inferred_first_name IS NULL THEN inferred_first_name := 'Avocat'; END IF;
    IF inferred_last_name IS NULL THEN inferred_last_name := 'Auto'; END IF;

    IF existing_lawyer_id IS NULL THEN
      generated_license := public.next_bar_license();

      INSERT INTO public.lawyers (
        profile_id,
        license,
        first_name,
        last_name,
        firm_id,
        status,
        admitted_on,
        email
      ) VALUES (
        membership_row.user_id,
        generated_license,
        inferred_first_name,
        inferred_last_name,
        membership_row.firm_id,
        'active'::public.license_status,
        CURRENT_DATE,
        NULLIF(trim(COALESCE(profile_email, '')), '')
      );
    ELSE
      UPDATE public.lawyers l
         SET status = 'active'::public.license_status,
             email = COALESCE(l.email, NULLIF(trim(COALESCE(profile_email, '')), '')),
             first_name = CASE
               WHEN COALESCE(NULLIF(trim(l.first_name), ''), '') = '' THEN inferred_first_name
               ELSE l.first_name
             END,
             last_name = CASE
               WHEN COALESCE(NULLIF(trim(l.last_name), ''), '') = '' THEN inferred_last_name
               ELSE l.last_name
             END,
             profile_id = COALESCE(l.profile_id, membership_row.user_id),
             firm_id = COALESCE(l.firm_id, membership_row.firm_id)
       WHERE l.id = existing_lawyer_id;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_memberships m
    JOIN public.enterprise_member_grades mg ON mg.membership_id = m.id
    JOIN public.enterprise_grades g ON g.id = mg.grade_id
    WHERE m.user_id = membership_row.user_id
      AND m.status = 'active'
      AND (
        lower(g.code) = 'lawyer'
        OR lower(g.name) = 'avocat'
        OR lower(g.name) = 'lawyer'
      )
  ) INTO has_any_lawyer_grade;

  IF NOT has_any_lawyer_grade THEN
    DELETE FROM public.user_roles
    WHERE user_id = membership_row.user_id
      AND role = 'avocat'::public.app_role;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enterprise_grades_lawyer_defaults_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM app_private.ensure_lawyer_grade_defaults(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enterprise_member_grades_lawyer_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app_private.sync_lawyer_profile_for_membership(NEW.membership_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM app_private.sync_lawyer_profile_for_membership(NEW.membership_id);
    IF OLD.membership_id IS DISTINCT FROM NEW.membership_id THEN
      PERFORM app_private.sync_lawyer_profile_for_membership(OLD.membership_id);
    END IF;
    RETURN NEW;
  END IF;

  PERFORM app_private.sync_lawyer_profile_for_membership(OLD.membership_id);
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enterprise_memberships_lawyer_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM app_private.sync_lawyer_profile_for_membership(NEW.id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enterprise_grades_lawyer_defaults ON public.enterprise_grades;
CREATE TRIGGER enterprise_grades_lawyer_defaults
AFTER INSERT OR UPDATE OF code, name ON public.enterprise_grades
FOR EACH ROW
EXECUTE FUNCTION app_private.enterprise_grades_lawyer_defaults_trigger();

DROP TRIGGER IF EXISTS enterprise_member_grades_lawyer_sync ON public.enterprise_member_grades;
CREATE TRIGGER enterprise_member_grades_lawyer_sync
AFTER INSERT OR UPDATE OR DELETE ON public.enterprise_member_grades
FOR EACH ROW
EXECUTE FUNCTION app_private.enterprise_member_grades_lawyer_sync_trigger();

DROP TRIGGER IF EXISTS enterprise_memberships_lawyer_sync ON public.enterprise_memberships;
CREATE TRIGGER enterprise_memberships_lawyer_sync
AFTER UPDATE OF status ON public.enterprise_memberships
FOR EACH ROW
EXECUTE FUNCTION app_private.enterprise_memberships_lawyer_sync_trigger();

-- Backfill defaults and lawyer profile consistency for existing memberships.
DO $$
DECLARE
  grade_row record;
  membership_row record;
BEGIN
  FOR grade_row IN
    SELECT id
    FROM public.enterprise_grades
    WHERE lower(code) = 'lawyer' OR lower(name) = 'avocat' OR lower(name) = 'lawyer'
  LOOP
    PERFORM app_private.ensure_lawyer_grade_defaults(grade_row.id);
  END LOOP;

  FOR membership_row IN
    SELECT DISTINCT em.id
    FROM public.enterprise_memberships em
    JOIN public.enterprise_member_grades mg ON mg.membership_id = em.id
    JOIN public.enterprise_grades eg ON eg.id = mg.grade_id
    WHERE lower(eg.code) = 'lawyer' OR lower(eg.name) = 'avocat' OR lower(eg.name) = 'lawyer'
  LOOP
    PERFORM app_private.sync_lawyer_profile_for_membership(membership_row.id);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION app_private.is_lawyer_grade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.ensure_lawyer_grade_defaults(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.sync_lawyer_profile_for_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enterprise_grades_lawyer_defaults_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enterprise_member_grades_lawyer_sync_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enterprise_memberships_lawyer_sync_trigger() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.is_lawyer_grade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.ensure_lawyer_grade_defaults(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.sync_lawyer_profile_for_membership(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.enterprise_grades_lawyer_defaults_trigger() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.enterprise_member_grades_lawyer_sync_trigger() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.enterprise_memberships_lawyer_sync_trigger() TO authenticated, service_role;

-- Multi-enterprise modular architecture
-- Corporation -> Entreprises (firms) -> Modules -> Grades -> Permissions -> Utilisateurs

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS brand_primary_color text,
  ADD COLUMN IF NOT EXISTS brand_secondary_color text,
  ADD COLUMN IF NOT EXISTS brand_accent_color text,
  ADD COLUMN IF NOT EXISTS visual_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_firm_id uuid REFERENCES public.firms(id) ON DELETE SET NULL;

DO $$
BEGIN
  CREATE TYPE public.enterprise_membership_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.enterprise_module_catalog (
  slug text PRIMARY KEY,
  label text NOT NULL,
  description text,
  route_path text,
  nav_group text NOT NULL DEFAULT 'operations',
  icon_name text,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.enterprise_modules (
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  module_slug text NOT NULL REFERENCES public.enterprise_module_catalog(slug) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (firm_id, module_slug)
);

CREATE TABLE IF NOT EXISTS public.enterprise_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, code),
  UNIQUE (firm_id, name)
);

CREATE TABLE IF NOT EXISTS public.enterprise_grade_modules (
  grade_id uuid NOT NULL REFERENCES public.enterprise_grades(id) ON DELETE CASCADE,
  module_slug text NOT NULL REFERENCES public.enterprise_module_catalog(slug) ON DELETE CASCADE,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grade_id, module_slug)
);

CREATE TABLE IF NOT EXISTS public.enterprise_permissions_catalog (
  permission_key text PRIMARY KEY,
  module_slug text REFERENCES public.enterprise_module_catalog(slug) ON DELETE SET NULL,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.enterprise_grade_permissions (
  grade_id uuid NOT NULL REFERENCES public.enterprise_grades(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.enterprise_permissions_catalog(permission_key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grade_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.enterprise_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  status public.enterprise_membership_status NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, firm_id)
);

CREATE TABLE IF NOT EXISTS public.enterprise_member_grades (
  membership_id uuid NOT NULL REFERENCES public.enterprise_memberships(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.enterprise_grades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, grade_id)
);

CREATE TABLE IF NOT EXISTS public.enterprise_module_targets (
  module_slug text NOT NULL REFERENCES public.enterprise_module_catalog(slug) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('table', 'rpc', 'route')),
  target_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module_slug, target_kind, target_name)
);

CREATE INDEX IF NOT EXISTS enterprise_modules_firm_idx ON public.enterprise_modules(firm_id);
CREATE INDEX IF NOT EXISTS enterprise_grades_firm_idx ON public.enterprise_grades(firm_id);
CREATE INDEX IF NOT EXISTS enterprise_memberships_user_idx ON public.enterprise_memberships(user_id);
CREATE INDEX IF NOT EXISTS enterprise_memberships_firm_idx ON public.enterprise_memberships(firm_id);
CREATE INDEX IF NOT EXISTS enterprise_member_grades_membership_idx ON public.enterprise_member_grades(membership_id);
CREATE INDEX IF NOT EXISTS enterprise_module_targets_kind_name_idx ON public.enterprise_module_targets(target_kind, target_name);

CREATE TRIGGER enterprise_module_catalog_updated_at
  BEFORE UPDATE ON public.enterprise_module_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enterprise_modules_updated_at
  BEFORE UPDATE ON public.enterprise_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enterprise_grades_updated_at
  BEFORE UPDATE ON public.enterprise_grades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enterprise_memberships_updated_at
  BEFORE UPDATE ON public.enterprise_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Dynamic catalog: new modules inserted here are automatically available for firm configuration.
INSERT INTO public.enterprise_module_catalog (slug, label, description, route_path, nav_group, icon_name, sort_order)
VALUES
  ('dashboard', 'Tableau de bord', 'Vue synthèse entreprise', '/tableau-de-bord', 'core', 'Gauge', 10),
  ('matters', 'Dossiers', 'Gestion des dossiers et suivi', '/dossiers', 'operations', 'FolderOpen', 20),
  ('clients', 'Clients', 'Fiches clients et rattachements', '/clients', 'operations', 'Users', 30),
  ('documents', 'Documents', 'Pièces et gestion documentaire', '/dossiers', 'operations', 'FileText', 40),
  ('document_generator', 'Générateur documentaire', 'Modèles et génération de documents', '/cabinet/modeles', 'operations', 'FileStack', 50),
  ('quotes', 'Devis', 'Gestion des devis', '/facturation', 'finance', 'ScrollText', 60),
  ('billing', 'Facturation', 'Factures et paiements', '/facturation', 'finance', 'Receipt', 70),
  ('signature', 'Signature', 'Signature électronique', '/facturation', 'finance', 'FileCheck2', 80),
  ('messaging', 'Messagerie', 'Communication autour des dossiers', '/dossiers', 'operations', 'MessageSquare', 90),
  ('calendar', 'Calendrier', 'Planification et agenda', null, 'operations', 'CalendarDays', 100),
  ('tasks', 'Tâches', 'Suivi des tâches d équipe', '/taches', 'operations', 'CheckSquare', 110),
  ('library', 'Bibliothèque', 'Bibliothèque juridique', '/bibliotheque', 'knowledge', 'BookOpen', 120),
  ('trainings', 'Formations', 'Formations professionnelles', '/formations', 'knowledge', 'GraduationCap', 130),
  ('exams', 'Examen', 'Examens et évaluations', '/examens', 'knowledge', 'Scale', 140)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  route_path = EXCLUDED.route_path,
  nav_group = EXCLUDED.nav_group,
  icon_name = EXCLUDED.icon_name,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.enterprise_permissions_catalog (permission_key, module_slug, label, description)
VALUES
  ('enterprise.manage', null, 'Gérer l entreprise', 'Modifier les paramètres, modules et identité visuelle'),
  ('grades.manage', null, 'Gérer les grades', 'Créer, modifier et supprimer les grades'),
  ('members.manage', null, 'Gérer les membres', 'Gérer les accès utilisateurs à l entreprise'),
  ('modules.manage', null, 'Gérer les modules', 'Activer ou désactiver les modules'),
  ('matters.manage', 'matters', 'Gérer les dossiers', 'Créer et modifier les dossiers'),
  ('clients.manage', 'clients', 'Gérer les clients', 'Créer et modifier les clients'),
  ('documents.manage', 'documents', 'Gérer les documents', 'Déposer et partager des documents'),
  ('billing.manage', 'billing', 'Gérer la facturation', 'Créer et modifier les factures'),
  ('quotes.manage', 'quotes', 'Gérer les devis', 'Créer et modifier les devis'),
  ('signature.manage', 'signature', 'Gérer les signatures', 'Émettre des demandes de signature'),
  ('messaging.manage', 'messaging', 'Gérer la messagerie', 'Accès complet à la messagerie'),
  ('tasks.manage', 'tasks', 'Gérer les tâches', 'Créer, assigner et clôturer les tâches'),
  ('library.manage', 'library', 'Gérer la bibliothèque', 'Gérer les contenus juridiques'),
  ('trainings.manage', 'trainings', 'Gérer les formations', 'Créer et administrer les formations'),
  ('exams.manage', 'exams', 'Gérer les examens', 'Créer et administrer les examens')
ON CONFLICT (permission_key) DO UPDATE SET
  module_slug = EXCLUDED.module_slug,
  label = EXCLUDED.label,
  description = EXCLUDED.description;

INSERT INTO public.enterprise_module_targets (module_slug, target_kind, target_name)
VALUES
  ('matters', 'table', 'public.matters'),
  ('matters', 'table', 'public.matter_assistants'),
  ('matters', 'table', 'public.matter_activity'),
  ('clients', 'table', 'public.clients'),
  ('clients', 'table', 'public.matter_clients'),
  ('documents', 'table', 'public.matter_documents'),
  ('document_generator', 'table', 'public.doc_templates'),
  ('document_generator', 'table', 'public.doc_template_versions'),
  ('document_generator', 'table', 'public.doc_template_categories'),
  ('quotes', 'table', 'public.invoices'),
  ('billing', 'table', 'public.invoices'),
  ('billing', 'table', 'public.invoice_items'),
  ('billing', 'table', 'public.invoice_payments'),
  ('signature', 'table', 'public.signature_links'),
  ('signature', 'table', 'public.signature_events'),
  ('signature', 'table', 'public.document_signatures'),
  ('messaging', 'table', 'public.matter_messages'),
  ('messaging', 'table', 'public.client_conversations'),
  ('messaging', 'table', 'public.client_conversation_messages'),
  ('tasks', 'table', 'public.matter_tasks'),
  ('library', 'table', 'public.library_articles'),
  ('library', 'table', 'public.library_categories'),
  ('trainings', 'table', 'public.trainings'),
  ('trainings', 'table', 'public.training_modules'),
  ('trainings', 'table', 'public.training_questions'),
  ('trainings', 'table', 'public.training_choices'),
  ('trainings', 'table', 'public.training_attempts'),
  ('exams', 'table', 'public.bar_exams'),
  ('exams', 'table', 'public.bar_exam_questions'),
  ('exams', 'table', 'public.bar_exam_choices'),
  ('exams', 'table', 'public.bar_exam_attempts'),
  ('exams', 'table', 'public.bar_exam_answers')
ON CONFLICT DO NOTHING;

INSERT INTO public.enterprise_module_targets (module_slug, target_kind, target_name)
VALUES
  ('matters', 'route', '/dossiers'),
  ('clients', 'route', '/clients'),
  ('documents', 'route', '/dossiers'),
  ('document_generator', 'route', '/cabinet/modeles'),
  ('quotes', 'route', '/facturation'),
  ('billing', 'route', '/facturation'),
  ('signature', 'route', '/signature'),
  ('messaging', 'route', '/dossiers'),
  ('tasks', 'route', '/taches'),
  ('library', 'route', '/bibliotheque'),
  ('trainings', 'route', '/formations'),
  ('exams', 'route', '/examens')
ON CONFLICT DO NOTHING;

INSERT INTO public.enterprise_modules (firm_id, module_slug, enabled)
SELECT f.id, m.slug, true
FROM public.firms f
CROSS JOIN public.enterprise_module_catalog m
ON CONFLICT (firm_id, module_slug) DO NOTHING;

INSERT INTO public.enterprise_memberships (user_id, firm_id, status, is_default)
SELECT DISTINCT l.profile_id, l.firm_id, 'active'::public.enterprise_membership_status, true
FROM public.lawyers l
WHERE l.profile_id IS NOT NULL AND l.firm_id IS NOT NULL
ON CONFLICT (user_id, firm_id) DO NOTHING;

INSERT INTO public.enterprise_memberships (user_id, firm_id, status, is_default)
SELECT DISTINCT c.profile_id, c.firm_id, 'active'::public.enterprise_membership_status, false
FROM public.clients c
WHERE c.profile_id IS NOT NULL AND c.firm_id IS NOT NULL
ON CONFLICT (user_id, firm_id) DO NOTHING;

WITH ranked AS (
  SELECT
    id,
    user_id,
    row_number() OVER (PARTITION BY user_id ORDER BY is_default DESC, created_at ASC) AS rn
  FROM public.enterprise_memberships
)
UPDATE public.enterprise_memberships m
SET is_default = (r.rn = 1)
FROM ranked r
WHERE r.id = m.id;

UPDATE public.profiles p
SET active_firm_id = m.firm_id
FROM public.enterprise_memberships m
WHERE m.user_id = p.id
  AND m.is_default = true
  AND p.active_firm_id IS NULL;

INSERT INTO public.enterprise_grades (firm_id, code, name, description, is_system)
SELECT f.id, g.code, g.name, g.description, true
FROM public.firms f
CROSS JOIN (
  VALUES
    ('manager', 'Direction entreprise', 'Gestion complète de l entreprise et des accès'),
    ('lawyer', 'Avocat', 'Gestion opérationnelle des dossiers et clients'),
    ('assistant', 'Assistant', 'Assistance opérationnelle'),
    ('client', 'Client', 'Accès client restreint'),
    ('trainer', 'Formateur', 'Gestion des formations'),
    ('examiner', 'Examinateur', 'Gestion des examens')
) AS g(code, name, description)
ON CONFLICT (firm_id, code) DO NOTHING;

INSERT INTO public.enterprise_grade_modules (grade_id, module_slug, allowed)
SELECT g.id, m.slug,
  CASE g.code
    WHEN 'manager' THEN true
    WHEN 'lawyer' THEN m.slug IN ('dashboard', 'matters', 'clients', 'documents', 'document_generator', 'quotes', 'billing', 'signature', 'messaging', 'tasks', 'library', 'trainings', 'exams')
    WHEN 'assistant' THEN m.slug IN ('dashboard', 'matters', 'clients', 'documents', 'messaging', 'tasks', 'library')
    WHEN 'client' THEN m.slug IN ('documents', 'quotes', 'billing', 'signature', 'messaging')
    WHEN 'trainer' THEN m.slug IN ('dashboard', 'trainings', 'library')
    WHEN 'examiner' THEN m.slug IN ('dashboard', 'exams', 'library')
    ELSE false
  END
FROM public.enterprise_grades g
JOIN public.enterprise_module_catalog m ON true
ON CONFLICT (grade_id, module_slug) DO NOTHING;

INSERT INTO public.enterprise_grade_permissions (grade_id, permission_key)
SELECT g.id, p.permission_key
FROM public.enterprise_grades g
JOIN public.enterprise_permissions_catalog p ON true
WHERE g.code = 'manager'
ON CONFLICT DO NOTHING;

INSERT INTO public.enterprise_member_grades (membership_id, grade_id)
SELECT m.id, g.id
FROM public.enterprise_memberships m
JOIN public.user_roles ur ON ur.user_id = m.user_id
JOIN public.enterprise_grades g ON g.firm_id = m.firm_id
WHERE (
  (ur.role = 'responsable_cabinet'::public.app_role AND g.code = 'manager') OR
  (ur.role = 'avocat'::public.app_role AND g.code = 'lawyer') OR
  (ur.role = 'assistant'::public.app_role AND g.code = 'assistant') OR
  (ur.role = 'formateur'::public.app_role AND g.code = 'trainer') OR
  (ur.role = 'examinateur'::public.app_role AND g.code = 'examiner') OR
  (ur.role = 'client'::public.app_role AND g.code = 'client')
)
ON CONFLICT DO NOTHING;

-- If user had no grade after migration, attach lawyer grade by default.
INSERT INTO public.enterprise_member_grades (membership_id, grade_id)
SELECT m.id, g.id
FROM public.enterprise_memberships m
JOIN public.enterprise_grades g ON g.firm_id = m.firm_id AND g.code = 'lawyer'
LEFT JOIN public.enterprise_member_grades mg ON mg.membership_id = m.id
WHERE mg.membership_id IS NULL
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.enterprise_module_catalog TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_grade_modules TO authenticated;
GRANT SELECT ON public.enterprise_permissions_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_grade_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_member_grades TO authenticated;
GRANT SELECT ON public.enterprise_module_targets TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

ALTER TABLE public.enterprise_module_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_grade_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_permissions_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_grade_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_member_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_module_targets ENABLE ROW LEVEL SECURITY;

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
BEGIN
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
         AND EXISTS (
           SELECT 1 FROM public.enterprise_memberships m
           WHERE m.user_id = _user_id
             AND m.firm_id = claimed_firm
             AND m.status = 'active'
         )
      THEN
        RETURN claimed_firm;
      END IF;
    END IF;
  END IF;

  SELECT p.active_firm_id
    INTO fallback_firm
    FROM public.profiles p
   WHERE p.id = _user_id;

  IF fallback_firm IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.enterprise_memberships m
       WHERE m.user_id = _user_id
         AND m.firm_id = fallback_firm
         AND m.status = 'active'
     )
  THEN
    RETURN fallback_firm;
  END IF;

  SELECT m.firm_id
    INTO fallback_firm
    FROM public.enterprise_memberships m
   WHERE m.user_id = _user_id
     AND m.status = 'active'
   ORDER BY m.is_default DESC, m.created_at ASC
   LIMIT 1;

  IF fallback_firm IS NOT NULL THEN
    RETURN fallback_firm;
  END IF;

  SELECT l.firm_id
    INTO fallback_firm
    FROM public.lawyers l
   WHERE l.profile_id = _user_id
   LIMIT 1;

  RETURN fallback_firm;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.is_enterprise_member(_user_id uuid, _firm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_memberships m
    WHERE m.user_id = _user_id
      AND m.firm_id = _firm_id
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.user_has_module(_user_id uuid, _firm_id uuid, _module_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_modules em
    WHERE em.firm_id = _firm_id
      AND em.module_slug = _module_slug
      AND em.enabled = true
      AND (
        app_private.has_role(_user_id, 'batonnier')
        OR EXISTS (
          SELECT 1
          FROM public.enterprise_memberships m
          JOIN public.enterprise_member_grades mg ON mg.membership_id = m.id
          JOIN public.enterprise_grade_modules gm ON gm.grade_id = mg.grade_id
          WHERE m.user_id = _user_id
            AND m.firm_id = _firm_id
            AND m.status = 'active'
            AND gm.module_slug = _module_slug
            AND gm.allowed = true
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.user_has_active_module(_module_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.user_has_module(
    auth.uid(),
    app_private.user_active_firm_id(auth.uid()),
    _module_slug
  );
$$;

CREATE OR REPLACE FUNCTION app_private.user_has_permission(_user_id uuid, _firm_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_private.has_role(_user_id, 'batonnier')
    OR EXISTS (
      SELECT 1
      FROM public.enterprise_memberships m
      JOIN public.enterprise_member_grades mg ON mg.membership_id = m.id
      JOIN public.enterprise_grade_permissions gp ON gp.grade_id = mg.grade_id
      WHERE m.user_id = _user_id
        AND m.firm_id = _firm_id
        AND m.status = 'active'
        AND gp.permission_key = _permission_key
    );
$$;

CREATE OR REPLACE FUNCTION app_private.user_has_active_permission(_permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.user_has_permission(
    auth.uid(),
    app_private.user_active_firm_id(auth.uid()),
    _permission_key
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_manage_enterprise(_firm_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_private.has_role(_user_id, 'batonnier')
    OR (
      app_private.is_enterprise_member(_user_id, _firm_id)
      AND app_private.user_has_permission(_user_id, _firm_id, 'enterprise.manage')
    );
$$;

CREATE OR REPLACE FUNCTION app_private.get_user_firm_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.user_active_firm_id(_user_id);
$$;

CREATE OR REPLACE FUNCTION app_private.users_share_firm(_actor_id uuid, _target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actor_firm AS (
    SELECT app_private.user_active_firm_id(_actor_id) AS firm_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM actor_firm af
    JOIN public.enterprise_memberships m1 ON m1.user_id = _actor_id AND m1.firm_id = af.firm_id AND m1.status = 'active'
    JOIN public.enterprise_memberships m2 ON m2.user_id = _target_id AND m2.firm_id = af.firm_id AND m2.status = 'active'
    WHERE af.firm_id IS NOT NULL
  );
$$;

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

  firm_id := app_private.user_active_firm_id(auth.uid());
  IF firm_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN app_private.user_has_module(auth.uid(), firm_id, m_slug);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_owned(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _owner_id = auth.uid()
    OR app_private.has_role(auth.uid(), 'batonnier')
    OR app_private.users_share_firm(auth.uid(), _owner_id);
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_matter(_matter_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_private.user_has_active_module('matters')
    AND EXISTS (
      SELECT 1
      FROM public.matters m
      WHERE m.id = _matter_id
        AND (
          app_private.can_access_owned(m.owner_id)
          OR EXISTS (
            SELECT 1
            FROM public.matter_assistants a
            WHERE a.matter_id = _matter_id
              AND a.user_id = auth.uid()
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_invoice(_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = _invoice_id
      AND app_private.can_access_owned(i.owner_id)
      AND (
        (i.kind = 'quote' AND app_private.user_has_active_module('quotes'))
        OR (i.kind <> 'quote' AND app_private.user_has_active_module('billing'))
      )
  );
$$;

REVOKE ALL ON FUNCTION app_private.user_active_firm_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_enterprise_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.user_has_module(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.user_has_active_module(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.user_has_permission(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.user_has_active_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_manage_enterprise(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_access_api_target(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.user_active_firm_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_enterprise_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.user_has_module(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.user_has_active_module(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.user_has_permission(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.user_has_active_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_manage_enterprise(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_api_target(text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS enterprise_module_catalog_read ON public.enterprise_module_catalog;
CREATE POLICY enterprise_module_catalog_read ON public.enterprise_module_catalog
  FOR SELECT TO authenticated, anon USING (is_active = true);

DROP POLICY IF EXISTS enterprise_modules_manage ON public.enterprise_modules;
CREATE POLICY enterprise_modules_manage ON public.enterprise_modules
  FOR ALL TO authenticated
  USING (app_private.can_manage_enterprise(firm_id, auth.uid()))
  WITH CHECK (app_private.can_manage_enterprise(firm_id, auth.uid()));

DROP POLICY IF EXISTS enterprise_grades_manage ON public.enterprise_grades;
CREATE POLICY enterprise_grades_manage ON public.enterprise_grades
  FOR ALL TO authenticated
  USING (app_private.can_manage_enterprise(firm_id, auth.uid()))
  WITH CHECK (app_private.can_manage_enterprise(firm_id, auth.uid()));

DROP POLICY IF EXISTS enterprise_grade_modules_manage ON public.enterprise_grade_modules;
CREATE POLICY enterprise_grade_modules_manage ON public.enterprise_grade_modules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_grades g
      WHERE g.id = grade_id
        AND app_private.can_manage_enterprise(g.firm_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.enterprise_grades g
      WHERE g.id = grade_id
        AND app_private.can_manage_enterprise(g.firm_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS enterprise_permissions_catalog_read ON public.enterprise_permissions_catalog;
CREATE POLICY enterprise_permissions_catalog_read ON public.enterprise_permissions_catalog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS enterprise_grade_permissions_manage ON public.enterprise_grade_permissions;
CREATE POLICY enterprise_grade_permissions_manage ON public.enterprise_grade_permissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_grades g
      WHERE g.id = grade_id
        AND app_private.can_manage_enterprise(g.firm_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.enterprise_grades g
      WHERE g.id = grade_id
        AND app_private.can_manage_enterprise(g.firm_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS enterprise_memberships_select ON public.enterprise_memberships;
CREATE POLICY enterprise_memberships_select ON public.enterprise_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR app_private.can_manage_enterprise(firm_id, auth.uid())
  );

DROP POLICY IF EXISTS enterprise_memberships_manage ON public.enterprise_memberships;
CREATE POLICY enterprise_memberships_manage ON public.enterprise_memberships
  FOR ALL TO authenticated
  USING (app_private.can_manage_enterprise(firm_id, auth.uid()))
  WITH CHECK (app_private.can_manage_enterprise(firm_id, auth.uid()));

DROP POLICY IF EXISTS enterprise_member_grades_manage ON public.enterprise_member_grades;
CREATE POLICY enterprise_member_grades_manage ON public.enterprise_member_grades
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.enterprise_memberships m
      JOIN public.enterprise_grades g ON g.firm_id = m.firm_id
      WHERE m.id = membership_id
        AND g.id = grade_id
        AND app_private.can_manage_enterprise(m.firm_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.enterprise_memberships m
      JOIN public.enterprise_grades g ON g.firm_id = m.firm_id
      WHERE m.id = membership_id
        AND g.id = grade_id
        AND app_private.can_manage_enterprise(m.firm_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS enterprise_module_targets_read ON public.enterprise_module_targets;
CREATE POLICY enterprise_module_targets_read ON public.enterprise_module_targets
  FOR SELECT TO authenticated USING (true);

-- Restrictive module guards: they are AND-ed with existing permissive policies.
DROP POLICY IF EXISTS matters_module_guard ON public.matters;
CREATE POLICY matters_module_guard ON public.matters
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('matters'))
  WITH CHECK (app_private.user_has_active_module('matters'));

DROP POLICY IF EXISTS clients_module_guard ON public.clients;
CREATE POLICY clients_module_guard ON public.clients
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('clients'))
  WITH CHECK (app_private.user_has_active_module('clients'));

DROP POLICY IF EXISTS matter_documents_module_guard ON public.matter_documents;
CREATE POLICY matter_documents_module_guard ON public.matter_documents
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('documents'))
  WITH CHECK (app_private.user_has_active_module('documents'));

DROP POLICY IF EXISTS matter_messages_module_guard ON public.matter_messages;
CREATE POLICY matter_messages_module_guard ON public.matter_messages
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('messaging'))
  WITH CHECK (app_private.user_has_active_module('messaging'));

DROP POLICY IF EXISTS client_conversations_module_guard ON public.client_conversations;
CREATE POLICY client_conversations_module_guard ON public.client_conversations
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('messaging'))
  WITH CHECK (app_private.user_has_active_module('messaging'));

DROP POLICY IF EXISTS client_conversation_messages_module_guard ON public.client_conversation_messages;
CREATE POLICY client_conversation_messages_module_guard ON public.client_conversation_messages
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('messaging'))
  WITH CHECK (app_private.user_has_active_module('messaging'));

DROP POLICY IF EXISTS matter_tasks_module_guard ON public.matter_tasks;
CREATE POLICY matter_tasks_module_guard ON public.matter_tasks
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('tasks'))
  WITH CHECK (app_private.user_has_active_module('tasks'));

DROP POLICY IF EXISTS invoices_module_guard ON public.invoices;
CREATE POLICY invoices_module_guard ON public.invoices
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    CASE
      WHEN kind = 'quote' THEN app_private.user_has_active_module('quotes')
      ELSE app_private.user_has_active_module('billing')
    END
  )
  WITH CHECK (
    CASE
      WHEN kind = 'quote' THEN app_private.user_has_active_module('quotes')
      ELSE app_private.user_has_active_module('billing')
    END
  );

DROP POLICY IF EXISTS invoice_items_module_guard ON public.invoice_items;
CREATE POLICY invoice_items_module_guard ON public.invoice_items
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND (
          (i.kind = 'quote' AND app_private.user_has_active_module('quotes'))
          OR (i.kind <> 'quote' AND app_private.user_has_active_module('billing'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND (
          (i.kind = 'quote' AND app_private.user_has_active_module('quotes'))
          OR (i.kind <> 'quote' AND app_private.user_has_active_module('billing'))
        )
    )
  );

DROP POLICY IF EXISTS invoice_payments_module_guard ON public.invoice_payments;
CREATE POLICY invoice_payments_module_guard ON public.invoice_payments
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND (
          (i.kind = 'quote' AND app_private.user_has_active_module('quotes'))
          OR (i.kind <> 'quote' AND app_private.user_has_active_module('billing'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND (
          (i.kind = 'quote' AND app_private.user_has_active_module('quotes'))
          OR (i.kind <> 'quote' AND app_private.user_has_active_module('billing'))
        )
    )
  );

DROP POLICY IF EXISTS signature_links_module_guard ON public.signature_links;
CREATE POLICY signature_links_module_guard ON public.signature_links
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('signature'))
  WITH CHECK (app_private.user_has_active_module('signature'));

DROP POLICY IF EXISTS signature_events_module_guard ON public.signature_events;
CREATE POLICY signature_events_module_guard ON public.signature_events
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('signature'))
  WITH CHECK (app_private.user_has_active_module('signature'));

DROP POLICY IF EXISTS document_signatures_module_guard ON public.document_signatures;
CREATE POLICY document_signatures_module_guard ON public.document_signatures
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('signature'))
  WITH CHECK (app_private.user_has_active_module('signature'));

DROP POLICY IF EXISTS library_articles_module_guard ON public.library_articles;
CREATE POLICY library_articles_module_guard ON public.library_articles
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('library'))
  WITH CHECK (app_private.user_has_active_module('library'));

DROP POLICY IF EXISTS library_categories_module_guard ON public.library_categories;
CREATE POLICY library_categories_module_guard ON public.library_categories
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('library'))
  WITH CHECK (app_private.user_has_active_module('library'));

DROP POLICY IF EXISTS trainings_module_guard ON public.trainings;
CREATE POLICY trainings_module_guard ON public.trainings
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('trainings'))
  WITH CHECK (app_private.user_has_active_module('trainings'));

DROP POLICY IF EXISTS training_modules_module_guard ON public.training_modules;
CREATE POLICY training_modules_module_guard ON public.training_modules
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('trainings'))
  WITH CHECK (app_private.user_has_active_module('trainings'));

DROP POLICY IF EXISTS training_questions_module_guard ON public.training_questions;
CREATE POLICY training_questions_module_guard ON public.training_questions
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('trainings'))
  WITH CHECK (app_private.user_has_active_module('trainings'));

DROP POLICY IF EXISTS training_choices_module_guard ON public.training_choices;
CREATE POLICY training_choices_module_guard ON public.training_choices
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('trainings'))
  WITH CHECK (app_private.user_has_active_module('trainings'));

DROP POLICY IF EXISTS training_attempts_module_guard ON public.training_attempts;
CREATE POLICY training_attempts_module_guard ON public.training_attempts
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('trainings'))
  WITH CHECK (app_private.user_has_active_module('trainings'));

DROP POLICY IF EXISTS bar_exams_module_guard ON public.bar_exams;
CREATE POLICY bar_exams_module_guard ON public.bar_exams
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('exams'))
  WITH CHECK (app_private.user_has_active_module('exams'));

DROP POLICY IF EXISTS bar_exam_questions_module_guard ON public.bar_exam_questions;
CREATE POLICY bar_exam_questions_module_guard ON public.bar_exam_questions
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('exams'))
  WITH CHECK (app_private.user_has_active_module('exams'));

DROP POLICY IF EXISTS bar_exam_choices_module_guard ON public.bar_exam_choices;
CREATE POLICY bar_exam_choices_module_guard ON public.bar_exam_choices
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('exams'))
  WITH CHECK (app_private.user_has_active_module('exams'));

DROP POLICY IF EXISTS bar_exam_attempts_module_guard ON public.bar_exam_attempts;
CREATE POLICY bar_exam_attempts_module_guard ON public.bar_exam_attempts
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('exams'))
  WITH CHECK (app_private.user_has_active_module('exams'));

DROP POLICY IF EXISTS bar_exam_answers_module_guard ON public.bar_exam_answers;
CREATE POLICY bar_exam_answers_module_guard ON public.bar_exam_answers
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.user_has_active_module('exams'))
  WITH CHECK (app_private.user_has_active_module('exams'));

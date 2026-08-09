-- Insurance claims and reimbursements modules
-- Adds firm-activatable sinistre / remboursement workflows with RLS, attachments and conversation threads.

DO $$ BEGIN
  CREATE TYPE public.insurance_request_status AS ENUM ('new', 'in_progress', 'accepted', 'rejected', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION app_private.can_access_firm_module(_user_id uuid, _firm_id uuid, _module_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_private.user_has_module(_user_id, _firm_id, _module_slug)
    OR app_private.client_has_firm_module(_user_id, _firm_id, _module_slug);
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_client_module_record(_user_id uuid, _firm_id uuid, _client_id uuid, _module_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_private.can_access_firm_module(_user_id, _firm_id, _module_slug)
    AND (
      app_private.user_has_module(_user_id, _firm_id, _module_slug)
      OR EXISTS (
        SELECT 1
        FROM public.clients client
        WHERE client.id = _client_id
          AND client.profile_id = _user_id
          AND client.firm_id = _firm_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION app_private.notify_firm_staff(
  _firm_id uuid,
  _type text,
  _title text,
  _body text,
  _link text,
  _entity_type text,
  _entity_id uuid,
  _exclude_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient record;
BEGIN
  FOR recipient IN
    SELECT DISTINCT m.user_id
    FROM public.enterprise_memberships m
    LEFT JOIN public.user_roles ur ON ur.user_id = m.user_id
    WHERE m.firm_id = _firm_id
      AND m.status = 'active'
      AND m.user_id IS NOT NULL
      AND (_exclude_user_id IS NULL OR m.user_id <> _exclude_user_id)
      AND COALESCE(ur.role::text, '') <> 'client'
  LOOP
    INSERT INTO public.notifications (
      user_id, type, title, body, link, entity_type, entity_id
    ) VALUES (
      recipient.user_id, _type, _title, _body, _link, _entity_type, _entity_id
    );
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES public.matters(id) ON DELETE SET NULL,
  number text UNIQUE,
  subject text NOT NULL,
  description text NOT NULL,
  incident_date date,
  incident_location text,
  incident_type text,
  estimated_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  status public.insurance_request_status NOT NULL DEFAULT 'new',
  staff_notes text,
  rejection_reason text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insurance_claim_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_client boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insurance_claim_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES public.matters(id) ON DELETE SET NULL,
  number text UNIQUE,
  subject text NOT NULL,
  description text NOT NULL,
  purchase_date date,
  vendor_name text,
  invoice_reference text,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  status public.insurance_request_status NOT NULL DEFAULT 'new',
  staff_notes text,
  rejection_reason text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refund_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_client boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refund_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insurance_claims_firm_idx ON public.insurance_claims(firm_id);
CREATE INDEX IF NOT EXISTS insurance_claims_client_idx ON public.insurance_claims(client_id);
CREATE INDEX IF NOT EXISTS insurance_claim_attachments_claim_idx ON public.insurance_claim_attachments(claim_id);
CREATE INDEX IF NOT EXISTS insurance_claim_messages_claim_idx ON public.insurance_claim_messages(claim_id);
CREATE INDEX IF NOT EXISTS refund_requests_firm_idx ON public.refund_requests(firm_id);
CREATE INDEX IF NOT EXISTS refund_requests_client_idx ON public.refund_requests(client_id);
CREATE INDEX IF NOT EXISTS refund_request_attachments_refund_idx ON public.refund_request_attachments(refund_id);
CREATE INDEX IF NOT EXISTS refund_request_messages_refund_idx ON public.refund_request_messages(refund_id);

CREATE OR REPLACE FUNCTION app_private.can_access_insurance_claim(_user_id uuid, _claim_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.insurance_claims c
    WHERE c.id = _claim_id
      AND app_private.can_access_firm_module(_user_id, c.firm_id, 'claims')
      AND (
        app_private.user_has_module(_user_id, c.firm_id, 'claims')
        OR EXISTS (
          SELECT 1
          FROM public.clients client
          WHERE client.id = c.client_id
            AND client.profile_id = _user_id
            AND client.firm_id = c.firm_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_refund_request(_user_id uuid, _refund_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.refund_requests r
    WHERE r.id = _refund_id
      AND app_private.can_access_firm_module(_user_id, r.firm_id, 'refunds')
      AND (
        app_private.user_has_module(_user_id, r.firm_id, 'refunds')
        OR EXISTS (
          SELECT 1
          FROM public.clients client
          WHERE client.id = r.client_id
            AND client.profile_id = _user_id
            AND client.firm_id = r.firm_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.insurance_claims_set_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  year_value integer := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()));
  sequence_value integer;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '^SIN-[0-9]{4}-', ''), '')::integer), 0) + 1
    INTO sequence_value
    FROM public.insurance_claims
   WHERE number LIKE 'SIN-' || year_value || '-%';

  NEW.number := 'SIN-' || year_value || '-' || lpad(sequence_value::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_requests_set_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  year_value integer := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()));
  sequence_value integer;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '^REM-[0-9]{4}-', ''), '')::integer), 0) + 1
    INTO sequence_value
    FROM public.refund_requests
   WHERE number LIKE 'REM-' || year_value || '-%';

  NEW.number := 'REM-' || year_value || '-' || lpad(sequence_value::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER insurance_claims_set_number
  BEFORE INSERT ON public.insurance_claims
  FOR EACH ROW EXECUTE FUNCTION public.insurance_claims_set_number();

CREATE TRIGGER insurance_claims_updated_at
  BEFORE UPDATE ON public.insurance_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER refund_requests_set_number
  BEFORE INSERT ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.refund_requests_set_number();

CREATE TRIGGER refund_requests_updated_at
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.enterprise_module_catalog (slug, label, description, route_path, nav_group, icon_name, sort_order)
VALUES
  ('claims', 'Déclaration de sinistre', 'Déclaration et suivi des sinistres', '/sinistres', 'operations', 'ShieldAlert', 95),
  ('refunds', 'Demande de remboursement', 'Demandes de remboursement et justificatifs', '/remboursements', 'finance', 'ReceiptText', 96)
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
  ('claims.manage', 'claims', 'Gérer les sinistres', 'Créer, traiter et clôturer les sinistres'),
  ('refunds.manage', 'refunds', 'Gérer les remboursements', 'Créer, traiter et clôturer les remboursements')
ON CONFLICT (permission_key) DO UPDATE SET
  module_slug = EXCLUDED.module_slug,
  label = EXCLUDED.label,
  description = EXCLUDED.description;

INSERT INTO public.enterprise_module_targets (module_slug, target_kind, target_name)
VALUES
  ('claims', 'table', 'public.insurance_claims'),
  ('claims', 'table', 'public.insurance_claim_attachments'),
  ('claims', 'table', 'public.insurance_claim_messages'),
  ('claims', 'route', '/sinistres'),
  ('claims', 'route', '/portail-client/sinistres'),
  ('refunds', 'table', 'public.refund_requests'),
  ('refunds', 'table', 'public.refund_request_attachments'),
  ('refunds', 'table', 'public.refund_request_messages'),
  ('refunds', 'route', '/remboursements'),
  ('refunds', 'route', '/portail-client/remboursements')
ON CONFLICT DO NOTHING;

INSERT INTO public.enterprise_modules (firm_id, module_slug, enabled)
SELECT f.id, m.slug, false
FROM public.firms f
CROSS JOIN (
  VALUES ('claims'), ('refunds')
) AS m(slug)
ON CONFLICT (firm_id, module_slug) DO NOTHING;

INSERT INTO public.enterprise_grade_modules (grade_id, module_slug, allowed)
SELECT g.id, m.slug,
  CASE g.code
    WHEN 'manager' THEN true
    WHEN 'lawyer' THEN true
    WHEN 'assistant' THEN true
    WHEN 'client' THEN true
    ELSE false
  END
FROM public.enterprise_grades g
CROSS JOIN (
  VALUES ('claims'), ('refunds')
) AS m(slug)
ON CONFLICT (grade_id, module_slug) DO NOTHING;

INSERT INTO public.enterprise_grade_permissions (grade_id, permission_key)
SELECT g.id, p.permission_key
FROM public.enterprise_grades g
JOIN public.enterprise_permissions_catalog p ON p.permission_key IN ('claims.manage', 'refunds.manage')
WHERE g.code = 'manager'
ON CONFLICT DO NOTHING;

ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claim_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claim_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_request_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_claim_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_claim_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_request_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_request_messages TO authenticated;
GRANT ALL ON public.insurance_claims TO service_role;
GRANT ALL ON public.insurance_claim_attachments TO service_role;
GRANT ALL ON public.insurance_claim_messages TO service_role;
GRANT ALL ON public.refund_requests TO service_role;
GRANT ALL ON public.refund_request_attachments TO service_role;
GRANT ALL ON public.refund_request_messages TO service_role;

DROP POLICY IF EXISTS insurance_claims_select ON public.insurance_claims;
CREATE POLICY insurance_claims_select ON public.insurance_claims
  FOR SELECT TO authenticated
  USING (app_private.can_access_insurance_claim(auth.uid(), id));

DROP POLICY IF EXISTS insurance_claims_insert ON public.insurance_claims;
CREATE POLICY insurance_claims_insert ON public.insurance_claims
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_access_firm_module(auth.uid(), firm_id, 'claims'));

DROP POLICY IF EXISTS insurance_claims_update ON public.insurance_claims;
CREATE POLICY insurance_claims_update ON public.insurance_claims
  FOR UPDATE TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'claims'))
  WITH CHECK (app_private.user_has_module(auth.uid(), firm_id, 'claims'));

DROP POLICY IF EXISTS insurance_claims_delete ON public.insurance_claims;
CREATE POLICY insurance_claims_delete ON public.insurance_claims
  FOR DELETE TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'claims'));

DROP POLICY IF EXISTS insurance_claim_attachments_select ON public.insurance_claim_attachments;
CREATE POLICY insurance_claim_attachments_select ON public.insurance_claim_attachments
  FOR SELECT TO authenticated
  USING (app_private.can_access_insurance_claim(auth.uid(), claim_id));

DROP POLICY IF EXISTS insurance_claim_attachments_write ON public.insurance_claim_attachments;
CREATE POLICY insurance_claim_attachments_write ON public.insurance_claim_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.insurance_claims c
      WHERE c.id = claim_id
        AND app_private.can_access_client_module_record(auth.uid(), c.firm_id, c.client_id, 'claims')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.insurance_claims c
      WHERE c.id = claim_id
        AND app_private.can_access_client_module_record(auth.uid(), c.firm_id, c.client_id, 'claims')
    )
  );

DROP POLICY IF EXISTS insurance_claim_messages_select ON public.insurance_claim_messages;
CREATE POLICY insurance_claim_messages_select ON public.insurance_claim_messages
  FOR SELECT TO authenticated
  USING (app_private.can_access_insurance_claim(auth.uid(), claim_id));

DROP POLICY IF EXISTS insurance_claim_messages_write ON public.insurance_claim_messages;
CREATE POLICY insurance_claim_messages_write ON public.insurance_claim_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.insurance_claims c
      WHERE c.id = claim_id
        AND app_private.can_access_client_module_record(auth.uid(), c.firm_id, c.client_id, 'claims')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.insurance_claims c
      WHERE c.id = claim_id
        AND app_private.can_access_client_module_record(auth.uid(), c.firm_id, c.client_id, 'claims')
    )
  );

DROP POLICY IF EXISTS refund_requests_select ON public.refund_requests;
CREATE POLICY refund_requests_select ON public.refund_requests
  FOR SELECT TO authenticated
  USING (app_private.can_access_refund_request(auth.uid(), id));

DROP POLICY IF EXISTS refund_requests_insert ON public.refund_requests;
CREATE POLICY refund_requests_insert ON public.refund_requests
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_access_firm_module(auth.uid(), firm_id, 'refunds'));

DROP POLICY IF EXISTS refund_requests_update ON public.refund_requests;
CREATE POLICY refund_requests_update ON public.refund_requests
  FOR UPDATE TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'refunds'))
  WITH CHECK (app_private.user_has_module(auth.uid(), firm_id, 'refunds'));

DROP POLICY IF EXISTS refund_requests_delete ON public.refund_requests;
CREATE POLICY refund_requests_delete ON public.refund_requests
  FOR DELETE TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'refunds'));

DROP POLICY IF EXISTS refund_request_attachments_select ON public.refund_request_attachments;
CREATE POLICY refund_request_attachments_select ON public.refund_request_attachments
  FOR SELECT TO authenticated
  USING (app_private.can_access_refund_request(auth.uid(), refund_id));

DROP POLICY IF EXISTS refund_request_attachments_write ON public.refund_request_attachments;
CREATE POLICY refund_request_attachments_write ON public.refund_request_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.refund_requests r
      WHERE r.id = refund_id
        AND app_private.can_access_client_module_record(auth.uid(), r.firm_id, r.client_id, 'refunds')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.refund_requests r
      WHERE r.id = refund_id
        AND app_private.can_access_client_module_record(auth.uid(), r.firm_id, r.client_id, 'refunds')
    )
  );

DROP POLICY IF EXISTS refund_request_messages_select ON public.refund_request_messages;
CREATE POLICY refund_request_messages_select ON public.refund_request_messages
  FOR SELECT TO authenticated
  USING (app_private.can_access_refund_request(auth.uid(), refund_id));

DROP POLICY IF EXISTS refund_request_messages_write ON public.refund_request_messages;
CREATE POLICY refund_request_messages_write ON public.refund_request_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.refund_requests r
      WHERE r.id = refund_id
        AND app_private.can_access_client_module_record(auth.uid(), r.firm_id, r.client_id, 'refunds')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.refund_requests r
      WHERE r.id = refund_id
        AND app_private.can_access_client_module_record(auth.uid(), r.firm_id, r.client_id, 'refunds')
    )
  );

CREATE OR REPLACE FUNCTION public.notify_insurance_claim_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM app_private.notify_firm_staff(
    NEW.firm_id,
    'claim_created',
    'Nouveau sinistre déclaré',
    NEW.subject || ' — ' || COALESCE(NEW.number, ''),
    '/sinistres?request=' || NEW.id::text,
    'insurance_claim',
    NEW.id,
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_refund_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM app_private.notify_firm_staff(
    NEW.firm_id,
    'refund_created',
    'Nouvelle demande de remboursement',
    NEW.subject || ' — ' || COALESCE(NEW.number, ''),
    '/remboursements?request=' || NEW.id::text,
    'refund_request',
    NEW.id,
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_insurance_claim_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_profile uuid;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT c.profile_id INTO client_profile
  FROM public.clients c
  WHERE c.id = NEW.client_id;

  IF client_profile IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, type, title, body, link, entity_type, entity_id
    ) VALUES (
      client_profile,
      'claim_status',
      'Mise a jour de votre sinistre',
      'Votre sinistre ' || COALESCE(NEW.number, '') || ' est maintenant au statut ' || NEW.status,
      '/portail-client/sinistres?request=' || NEW.id::text,
      'insurance_claim',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_refund_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_profile uuid;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT c.profile_id INTO client_profile
  FROM public.clients c
  WHERE c.id = NEW.client_id;

  IF client_profile IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, type, title, body, link, entity_type, entity_id
    ) VALUES (
      client_profile,
      'refund_status',
      'Mise a jour de votre remboursement',
      'Votre demande ' || COALESCE(NEW.number, '') || ' est maintenant au statut ' || NEW.status,
      '/portail-client/remboursements?request=' || NEW.id::text,
      'refund_request',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_insurance_claim_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claim_row record;
  client_profile uuid;
BEGIN
  SELECT c.firm_id, c.client_id, client.profile_id
    INTO claim_row
  FROM public.insurance_claims c
  JOIN public.clients client ON client.id = c.client_id
  WHERE c.id = NEW.claim_id;

  IF claim_row.profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.author_id AND ur.role = 'client') THEN
    PERFORM app_private.notify_firm_staff(
      claim_row.firm_id,
      'claim_message',
      'Nouveau message sur un sinistre',
      NEW.body,
      '/sinistres?request=' || NEW.claim_id::text,
      'insurance_claim_message',
      NEW.claim_id,
      NEW.author_id
    );
  ELSE
    INSERT INTO public.notifications (
      user_id, type, title, body, link, entity_type, entity_id
    ) VALUES (
      claim_row.profile_id,
      'claim_message',
      'Réponse à votre sinistre',
      NEW.body,
      '/portail-client/sinistres?request=' || NEW.claim_id::text,
      'insurance_claim_message',
      NEW.claim_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_refund_request_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  refund_row record;
BEGIN
  SELECT r.firm_id, client.profile_id
    INTO refund_row
  FROM public.refund_requests r
  JOIN public.clients client ON client.id = r.client_id
  WHERE r.id = NEW.refund_id;

  IF refund_row.profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.author_id AND ur.role = 'client') THEN
    PERFORM app_private.notify_firm_staff(
      refund_row.firm_id,
      'refund_message',
      'Nouveau message sur une demande de remboursement',
      NEW.body,
      '/remboursements?request=' || NEW.refund_id::text,
      'refund_request_message',
      NEW.refund_id,
      NEW.author_id
    );
  ELSE
    INSERT INTO public.notifications (
      user_id, type, title, body, link, entity_type, entity_id
    ) VALUES (
      refund_row.profile_id,
      'refund_message',
      'Réponse à votre remboursement',
      NEW.body,
      '/portail-client/remboursements?request=' || NEW.refund_id::text,
      'refund_request_message',
      NEW.refund_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_insurance_claim_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_profile uuid;
  firm_identifier uuid;
BEGIN
  SELECT c.firm_id, client.profile_id
    INTO firm_identifier, client_profile
  FROM public.insurance_claims c
  JOIN public.clients client ON client.id = c.client_id
  WHERE c.id = NEW.claim_id;

  IF client_profile IS NULL OR firm_identifier IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.uploaded_by_client THEN
    PERFORM app_private.notify_firm_staff(
      firm_identifier,
      'claim_attachment',
      'Pièce jointe sur un sinistre',
      NEW.filename,
      '/sinistres?request=' || NEW.claim_id::text,
      'insurance_claim_attachment',
      NEW.claim_id,
      NEW.uploaded_by
    );
  ELSE
    INSERT INTO public.notifications (
      user_id, type, title, body, link, entity_type, entity_id
    ) VALUES (
      client_profile,
      'claim_attachment',
      'Pièce jointe ajoutée à votre sinistre',
      NEW.filename,
      '/portail-client/sinistres?request=' || NEW.claim_id::text,
      'insurance_claim_attachment',
      NEW.claim_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_refund_request_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_profile uuid;
  firm_identifier uuid;
BEGIN
  SELECT r.firm_id, client.profile_id
    INTO firm_identifier, client_profile
  FROM public.refund_requests r
  JOIN public.clients client ON client.id = r.client_id
  WHERE r.id = NEW.refund_id;

  IF client_profile IS NULL OR firm_identifier IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.uploaded_by_client THEN
    PERFORM app_private.notify_firm_staff(
      firm_identifier,
      'refund_attachment',
      'Pièce jointe sur un remboursement',
      NEW.filename,
      '/remboursements?request=' || NEW.refund_id::text,
      'refund_request_attachment',
      NEW.refund_id,
      NEW.uploaded_by
    );
  ELSE
    INSERT INTO public.notifications (
      user_id, type, title, body, link, entity_type, entity_id
    ) VALUES (
      client_profile,
      'refund_attachment',
      'Pièce jointe ajoutée à votre remboursement',
      NEW.filename,
      '/portail-client/remboursements?request=' || NEW.refund_id::text,
      'refund_request_attachment',
      NEW.refund_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS insurance_claims_created_notify ON public.insurance_claims;
CREATE TRIGGER insurance_claims_created_notify
  AFTER INSERT ON public.insurance_claims
  FOR EACH ROW EXECUTE FUNCTION public.notify_insurance_claim_created();

DROP TRIGGER IF EXISTS insurance_claims_status_notify ON public.insurance_claims;
CREATE TRIGGER insurance_claims_status_notify
  AFTER UPDATE OF status ON public.insurance_claims
  FOR EACH ROW EXECUTE FUNCTION public.notify_insurance_claim_status_change();

DROP TRIGGER IF EXISTS insurance_claim_messages_notify ON public.insurance_claim_messages;
CREATE TRIGGER insurance_claim_messages_notify
  AFTER INSERT ON public.insurance_claim_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_insurance_claim_message();

DROP TRIGGER IF EXISTS insurance_claim_attachments_notify ON public.insurance_claim_attachments;
CREATE TRIGGER insurance_claim_attachments_notify
  AFTER INSERT ON public.insurance_claim_attachments
  FOR EACH ROW EXECUTE FUNCTION public.notify_insurance_claim_attachments();

DROP TRIGGER IF EXISTS refund_requests_created_notify ON public.refund_requests;
CREATE TRIGGER refund_requests_created_notify
  AFTER INSERT ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_refund_request_created();

DROP TRIGGER IF EXISTS refund_requests_status_notify ON public.refund_requests;
CREATE TRIGGER refund_requests_status_notify
  AFTER UPDATE OF status ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_refund_request_status_change();

DROP TRIGGER IF EXISTS refund_request_messages_notify ON public.refund_request_messages;
CREATE TRIGGER refund_request_messages_notify
  AFTER INSERT ON public.refund_request_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_refund_request_message();

DROP TRIGGER IF EXISTS refund_request_attachments_notify ON public.refund_request_attachments;
CREATE TRIGGER refund_request_attachments_notify
  AFTER INSERT ON public.refund_request_attachments
  FOR EACH ROW EXECUTE FUNCTION public.notify_refund_request_attachments();

REVOKE ALL ON FUNCTION app_private.can_access_firm_module(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_access_insurance_claim(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_access_refund_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.notify_firm_staff(uuid, text, text, text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insurance_claims_set_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_requests_set_number() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.can_access_firm_module(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_insurance_claim(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_refund_request(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.notify_firm_staff(uuid, text, text, text, text, text, uuid, uuid) TO authenticated, service_role;
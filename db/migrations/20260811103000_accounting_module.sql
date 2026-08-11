-- Accounting module: multi-company accounting operations with Discord webhook ingestion.

DO $$ BEGIN
  CREATE TYPE public.accounting_company_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.accounting_operation_side AS ENUM ('revenue', 'expense', 'unclassified');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.accounting_processing_status AS ENUM ('pending', 'processed', 'anomaly', 'duplicate');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.accounting_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  legal_name text,
  company_type text,
  internal_identifier text,
  discord_server_id text,
  discord_channel_id text,
  discord_channel_url text,
  status public.accounting_company_status NOT NULL DEFAULT 'active',
  added_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.accounting_companies(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'discord',
  discord_server_id text,
  discord_channel_id text,
  discord_message_id text,
  occurred_at timestamptz,
  author_name text,
  content text,
  embeds jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status public.accounting_processing_status NOT NULL DEFAULT 'pending',
  anomaly_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.accounting_companies(id) ON DELETE SET NULL,
  webhook_event_id uuid UNIQUE REFERENCES public.accounting_webhook_events(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'discord',
  discord_message_id text,
  entry_side public.accounting_operation_side NOT NULL DEFAULT 'unclassified',
  entry_type text,
  invoice_number text,
  counterparty text,
  description text,
  amount numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  operation_date date,
  due_date date,
  payment_date date,
  status text NOT NULL DEFAULT 'to_classify',
  needs_classification boolean NOT NULL DEFAULT true,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounting_companies_firm_idx ON public.accounting_companies(firm_id);
CREATE INDEX IF NOT EXISTS accounting_companies_status_idx ON public.accounting_companies(status);
CREATE INDEX IF NOT EXISTS accounting_companies_discord_idx ON public.accounting_companies(discord_server_id, discord_channel_id);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_companies_discord_unique_per_firm
  ON public.accounting_companies(firm_id, discord_server_id, discord_channel_id)
  WHERE discord_server_id IS NOT NULL AND discord_channel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS accounting_webhooks_firm_idx ON public.accounting_webhook_events(firm_id);
CREATE INDEX IF NOT EXISTS accounting_webhooks_company_idx ON public.accounting_webhook_events(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_webhooks_discord_message_unique
  ON public.accounting_webhook_events(discord_message_id)
  WHERE discord_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS accounting_operations_firm_idx ON public.accounting_operations(firm_id);
CREATE INDEX IF NOT EXISTS accounting_operations_company_idx ON public.accounting_operations(company_id);
CREATE INDEX IF NOT EXISTS accounting_operations_side_idx ON public.accounting_operations(entry_side);
CREATE INDEX IF NOT EXISTS accounting_operations_status_idx ON public.accounting_operations(status);
CREATE INDEX IF NOT EXISTS accounting_operations_date_idx ON public.accounting_operations(operation_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_operations_discord_message_unique
  ON public.accounting_operations(firm_id, discord_message_id)
  WHERE discord_message_id IS NOT NULL;

CREATE TRIGGER accounting_companies_updated_at
  BEFORE UPDATE ON public.accounting_companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER accounting_webhook_events_updated_at
  BEFORE UPDATE ON public.accounting_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER accounting_operations_updated_at
  BEFORE UPDATE ON public.accounting_operations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.accounting_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_operations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_webhook_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_operations TO authenticated;

GRANT ALL ON public.accounting_companies TO service_role;
GRANT ALL ON public.accounting_webhook_events TO service_role;
GRANT ALL ON public.accounting_operations TO service_role;

DROP POLICY IF EXISTS accounting_companies_select ON public.accounting_companies;
CREATE POLICY accounting_companies_select ON public.accounting_companies
  FOR SELECT TO authenticated
  USING (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'));

DROP POLICY IF EXISTS accounting_companies_insert ON public.accounting_companies;
CREATE POLICY accounting_companies_insert ON public.accounting_companies
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'));

DROP POLICY IF EXISTS accounting_companies_update ON public.accounting_companies;
CREATE POLICY accounting_companies_update ON public.accounting_companies
  FOR UPDATE TO authenticated
  USING (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'))
  WITH CHECK (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'));

DROP POLICY IF EXISTS accounting_companies_delete ON public.accounting_companies;
CREATE POLICY accounting_companies_delete ON public.accounting_companies
  FOR DELETE TO authenticated
  USING (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'));

DROP POLICY IF EXISTS accounting_webhook_events_select ON public.accounting_webhook_events;
CREATE POLICY accounting_webhook_events_select ON public.accounting_webhook_events
  FOR SELECT TO authenticated
  USING (
    firm_id IS NOT NULL
    AND app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting')
  );

DROP POLICY IF EXISTS accounting_webhook_events_insert ON public.accounting_webhook_events;
CREATE POLICY accounting_webhook_events_insert ON public.accounting_webhook_events
  FOR INSERT TO authenticated
  WITH CHECK (
    firm_id IS NOT NULL
    AND app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting')
  );

DROP POLICY IF EXISTS accounting_webhook_events_update ON public.accounting_webhook_events;
CREATE POLICY accounting_webhook_events_update ON public.accounting_webhook_events
  FOR UPDATE TO authenticated
  USING (
    firm_id IS NOT NULL
    AND app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting')
  )
  WITH CHECK (
    firm_id IS NOT NULL
    AND app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting')
  );

DROP POLICY IF EXISTS accounting_webhook_events_delete ON public.accounting_webhook_events;
CREATE POLICY accounting_webhook_events_delete ON public.accounting_webhook_events
  FOR DELETE TO authenticated
  USING (
    firm_id IS NOT NULL
    AND app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting')
  );

DROP POLICY IF EXISTS accounting_operations_select ON public.accounting_operations;
CREATE POLICY accounting_operations_select ON public.accounting_operations
  FOR SELECT TO authenticated
  USING (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'));

DROP POLICY IF EXISTS accounting_operations_insert ON public.accounting_operations;
CREATE POLICY accounting_operations_insert ON public.accounting_operations
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'));

DROP POLICY IF EXISTS accounting_operations_update ON public.accounting_operations;
CREATE POLICY accounting_operations_update ON public.accounting_operations
  FOR UPDATE TO authenticated
  USING (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'))
  WITH CHECK (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'));

DROP POLICY IF EXISTS accounting_operations_delete ON public.accounting_operations;
CREATE POLICY accounting_operations_delete ON public.accounting_operations
  FOR DELETE TO authenticated
  USING (app_private.can_access_firm_module(auth.uid(), firm_id, 'accounting'));

INSERT INTO public.enterprise_module_catalog (slug, label, description, route_path, nav_group, icon_name, sort_order)
VALUES
  ('accounting', 'Comptabilité', 'Journal comptable multi-sociétés avec ingestion Discord', '/comptabilite', 'finance', 'Calculator', 97)
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
  ('accounting.companies.manage', 'accounting', 'Gérer les sociétés', 'Créer, éditer, activer et supprimer les sociétés comptables'),
  ('accounting.operations.manage', 'accounting', 'Gérer les opérations', 'Classifier et éditer les écritures comptables'),
  ('accounting.webhooks.review', 'accounting', 'Analyser les webhooks', 'Consulter et traiter les anomalies de webhooks')
ON CONFLICT (permission_key) DO UPDATE SET
  module_slug = EXCLUDED.module_slug,
  label = EXCLUDED.label,
  description = EXCLUDED.description;

INSERT INTO public.enterprise_module_targets (module_slug, target_kind, target_name)
VALUES
  ('accounting', 'table', 'public.accounting_companies'),
  ('accounting', 'table', 'public.accounting_webhook_events'),
  ('accounting', 'table', 'public.accounting_operations'),
  ('accounting', 'route', '/comptabilite'),
  ('accounting', 'route', '/api/comptabilite/discord-webhook')
ON CONFLICT DO NOTHING;

INSERT INTO public.enterprise_modules (firm_id, module_slug, enabled)
SELECT f.id, 'accounting', false
FROM public.firms f
ON CONFLICT (firm_id, module_slug) DO NOTHING;

INSERT INTO public.enterprise_grade_modules (grade_id, module_slug, allowed)
SELECT g.id, 'accounting',
  CASE g.code
    WHEN 'manager' THEN true
    WHEN 'lawyer' THEN true
    WHEN 'assistant' THEN true
    ELSE false
  END
FROM public.enterprise_grades g
ON CONFLICT (grade_id, module_slug) DO NOTHING;

INSERT INTO public.enterprise_grade_permissions (grade_id, permission_key)
SELECT g.id, p.permission_key
FROM public.enterprise_grades g
JOIN public.enterprise_permissions_catalog p
  ON p.permission_key IN ('accounting.companies.manage', 'accounting.operations.manage', 'accounting.webhooks.review')
WHERE g.code = 'manager'
ON CONFLICT DO NOTHING;

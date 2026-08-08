-- ============ 1. CLIENTS ============
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS firm_id uuid REFERENCES public.firms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS discord_webhook_url text;

CREATE UNIQUE INDEX IF NOT EXISTS clients_profile_id_key ON public.clients(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_firm_id_idx ON public.clients(firm_id);

UPDATE public.clients c
   SET firm_id = l.firm_id
  FROM public.lawyers l
 WHERE l.profile_id = c.owner_id AND c.firm_id IS NULL AND l.firm_id IS NOT NULL;

-- ============ 1b. NEW TABLES / COLUMNS (before helper functions) ============
CREATE TABLE IF NOT EXISTS public.matter_clients (
  matter_id uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (matter_id, client_id)
);

ALTER TABLE public.matter_documents
  ADD COLUMN IF NOT EXISTS shared_with_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by_client boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.matter_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT false,
  document_id uuid REFERENCES public.matter_documents(id) ON DELETE SET NULL,
  read_by_client_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS refused_at timestamptz,
  ADD COLUMN IF NOT EXISTS refusal_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

-- ============ 2. HELPERS ============
CREATE OR REPLACE FUNCTION app_private.is_client_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients WHERE profile_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION app_private.client_matter_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT mc.matter_id FROM public.matter_clients mc
    JOIN public.clients c ON c.id = mc.client_id
   WHERE c.profile_id = _user_id
  UNION
  SELECT m.id FROM public.matters m
    JOIN public.clients c ON c.id = m.client_id
   WHERE c.profile_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION app_private.is_client_matter(_matter_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM app_private.client_matter_ids(_user_id) x WHERE x = _matter_id);
$$;

CREATE OR REPLACE FUNCTION app_private.is_client_invoice(_invoice_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
      JOIN public.clients c ON c.id = i.client_id
     WHERE i.id = _invoice_id AND c.profile_id = _user_id
       AND COALESCE(i.delivery_mode, 'link') IN ('portal', 'both')
       AND COALESCE(i.delivery_status, 'draft') <> 'draft'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_manage_firm_clients(_firm_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT app_private.has_role(_user_id, 'batonnier')
      OR (_firm_id IS NOT NULL
          AND app_private.has_role(_user_id, 'responsable_cabinet')
          AND app_private.get_user_firm_id(_user_id) = _firm_id);
$$;

REVOKE ALL ON FUNCTION app_private.is_client_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.client_matter_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_client_matter(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_client_invoice(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_manage_firm_clients(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_client_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.client_matter_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_client_matter(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_client_invoice(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_manage_firm_clients(uuid, uuid) TO authenticated, service_role;

-- ============ 3. MATTER <-> CLIENTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matter_clients TO authenticated;
GRANT ALL ON public.matter_clients TO service_role;
ALTER TABLE public.matter_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_clients_firm_all ON public.matter_clients;
CREATE POLICY matter_clients_firm_all ON public.matter_clients FOR ALL TO authenticated
  USING (app_private.can_access_matter(matter_id))
  WITH CHECK (app_private.can_access_matter(matter_id));

DROP POLICY IF EXISTS matter_clients_client_read ON public.matter_clients;
CREATE POLICY matter_clients_client_read ON public.matter_clients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.profile_id = auth.uid()));

INSERT INTO public.matter_clients (matter_id, client_id)
SELECT m.id, m.client_id FROM public.matters m WHERE m.client_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============ 4. DOCUMENTS SHARED WITH CLIENT ============
DROP POLICY IF EXISTS matter_documents_client_read ON public.matter_documents;
CREATE POLICY matter_documents_client_read ON public.matter_documents FOR SELECT TO authenticated
  USING (shared_with_client = true AND app_private.is_client_matter(matter_id, auth.uid()));

DROP POLICY IF EXISTS matter_documents_client_insert ON public.matter_documents;
CREATE POLICY matter_documents_client_insert ON public.matter_documents FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND uploaded_by_client = true
    AND shared_with_client = true
    AND app_private.is_client_matter(matter_id, auth.uid())
  );

-- ============ 5. CONVERSATIONS ============
CREATE INDEX IF NOT EXISTS matter_messages_matter_idx ON public.matter_messages(matter_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matter_messages TO authenticated;
GRANT ALL ON public.matter_messages TO service_role;
ALTER TABLE public.matter_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_messages_firm_all ON public.matter_messages;
CREATE POLICY matter_messages_firm_all ON public.matter_messages FOR ALL TO authenticated
  USING (app_private.can_access_matter(matter_id))
  WITH CHECK (app_private.can_access_matter(matter_id) AND author_id = auth.uid());

DROP POLICY IF EXISTS matter_messages_client_read ON public.matter_messages;
CREATE POLICY matter_messages_client_read ON public.matter_messages FOR SELECT TO authenticated
  USING (internal = false AND app_private.is_client_matter(matter_id, auth.uid()));

DROP POLICY IF EXISTS matter_messages_client_insert ON public.matter_messages;
CREATE POLICY matter_messages_client_insert ON public.matter_messages FOR INSERT TO authenticated
  WITH CHECK (internal = false AND author_id = auth.uid() AND app_private.is_client_matter(matter_id, auth.uid()));

CREATE TRIGGER matter_messages_touch BEFORE UPDATE ON public.matter_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 6. INVOICES DELIVERY + STATUS ============
DROP POLICY IF EXISTS invoices_client_read ON public.invoices;
CREATE POLICY invoices_client_read ON public.invoices FOR SELECT TO authenticated
  USING (app_private.is_client_invoice(id, auth.uid()));

DROP POLICY IF EXISTS invoice_items_client_read ON public.invoice_items;
CREATE POLICY invoice_items_client_read ON public.invoice_items FOR SELECT TO authenticated
  USING (app_private.is_client_invoice(invoice_id, auth.uid()));

-- ============ 7. CLIENT SELF ACCESS ============
DROP POLICY IF EXISTS clients_self_read ON public.clients;
CREATE POLICY clients_self_read ON public.clients FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS clients_self_update ON public.clients;
CREATE POLICY clients_self_update ON public.clients FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS matters_client_read ON public.matters;
CREATE POLICY matters_client_read ON public.matters FOR SELECT TO authenticated
  USING (app_private.is_client_matter(id, auth.uid()));

DROP POLICY IF EXISTS matter_activity_client_read ON public.matter_activity;
CREATE POLICY matter_activity_client_read ON public.matter_activity FOR SELECT TO authenticated
  USING (app_private.is_client_matter(matter_id, auth.uid()));

-- ============ 8. STORAGE: client uploads / reads under matters/<matter_id>/ ============
DROP POLICY IF EXISTS bar_media_client_read ON storage.objects;
CREATE POLICY bar_media_client_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bar-media'
    AND name LIKE 'matters/%'
    AND EXISTS (
      SELECT 1 FROM public.matter_documents d
      WHERE d.storage_path = storage.objects.name
        AND d.shared_with_client = true
        AND app_private.is_client_matter(d.matter_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS bar_media_client_insert ON storage.objects;
CREATE POLICY bar_media_client_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bar-media'
    AND name LIKE 'matters/%'
    AND app_private.is_client_matter(NULLIF(split_part(name, '/', 2), '')::uuid, auth.uid())
  );

-- ============ 9. AUDIT ============
CREATE TRIGGER audit_matter_messages AFTER INSERT OR UPDATE OR DELETE ON public.matter_messages
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row();
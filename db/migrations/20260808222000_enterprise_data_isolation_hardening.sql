-- Hardening: strict per-enterprise data isolation on business data.
-- Guarantees that rows are scoped to the active enterprise both at write-time
-- (firm ownership assignment/immutability) and read-time (restrictive RLS guards).

ALTER TABLE public.matters
  ADD COLUMN IF NOT EXISTS firm_id uuid REFERENCES public.firms(id) ON DELETE RESTRICT;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS firm_id uuid REFERENCES public.firms(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS matters_firm_id_idx ON public.matters(firm_id);
CREATE INDEX IF NOT EXISTS invoices_firm_id_idx ON public.invoices(firm_id);

-- Backfill best-effort from existing relations; no row is deleted or moved.
UPDATE public.clients c
SET firm_id = app_private.get_user_firm_id(c.owner_id)
WHERE c.firm_id IS NULL;

UPDATE public.matters m
SET firm_id = COALESCE(c.firm_id, app_private.get_user_firm_id(m.owner_id))
FROM public.clients c
WHERE m.firm_id IS NULL
  AND m.client_id = c.id;

UPDATE public.matters m
SET firm_id = app_private.get_user_firm_id(m.owner_id)
WHERE m.firm_id IS NULL;

UPDATE public.invoices i
SET firm_id = COALESCE(
  m.firm_id,
  (SELECT c.firm_id FROM public.clients c WHERE c.id = i.client_id),
  app_private.get_user_firm_id(i.owner_id)
)
FROM public.matters m
WHERE i.firm_id IS NULL
  AND i.matter_id = m.id;

UPDATE public.invoices i
SET firm_id = COALESCE(c.firm_id, app_private.get_user_firm_id(i.owner_id))
FROM public.clients c
WHERE i.firm_id IS NULL
  AND i.client_id = c.id;

UPDATE public.invoices i
SET firm_id = app_private.get_user_firm_id(i.owner_id)
WHERE i.firm_id IS NULL;

CREATE OR REPLACE FUNCTION app_private.is_active_firm(_firm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _firm_id IS NOT NULL
     AND _firm_id = app_private.user_active_firm_id(auth.uid());
$$;

CREATE OR REPLACE FUNCTION app_private.assign_client_firm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_firm uuid;
BEGIN
  active_firm := app_private.user_active_firm_id(auth.uid());

  IF TG_OP = 'INSERT' THEN
    IF NEW.firm_id IS NULL THEN
      NEW.firm_id := COALESCE(active_firm, app_private.get_user_firm_id(NEW.owner_id));
    END IF;
    IF NEW.firm_id IS NULL THEN
      RAISE EXCEPTION 'Client must belong to an enterprise';
    END IF;
  ELSE
    IF NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
      RAISE EXCEPTION 'Changing client enterprise is forbidden';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.assign_matter_firm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_firm uuid;
  client_firm uuid;
  resolved_firm uuid;
BEGIN
  active_firm := app_private.user_active_firm_id(auth.uid());

  IF NEW.client_id IS NOT NULL THEN
    SELECT c.firm_id INTO client_firm
    FROM public.clients c
    WHERE c.id = NEW.client_id;
  END IF;

  resolved_firm := COALESCE(NEW.firm_id, client_firm, active_firm, app_private.get_user_firm_id(NEW.owner_id));

  IF resolved_firm IS NULL THEN
    RAISE EXCEPTION 'Matter must belong to an enterprise';
  END IF;

  IF client_firm IS NOT NULL AND client_firm IS DISTINCT FROM resolved_firm THEN
    RAISE EXCEPTION 'Matter and client must belong to the same enterprise';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.firm_id IS DISTINCT FROM resolved_firm THEN
    RAISE EXCEPTION 'Changing matter enterprise is forbidden';
  END IF;

  NEW.firm_id := resolved_firm;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.assign_invoice_firm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_firm uuid;
  matter_firm uuid;
  client_firm uuid;
  resolved_firm uuid;
BEGIN
  active_firm := app_private.user_active_firm_id(auth.uid());

  IF NEW.matter_id IS NOT NULL THEN
    SELECT m.firm_id INTO matter_firm
    FROM public.matters m
    WHERE m.id = NEW.matter_id;
  END IF;

  IF NEW.client_id IS NOT NULL THEN
    SELECT c.firm_id INTO client_firm
    FROM public.clients c
    WHERE c.id = NEW.client_id;
  END IF;

  IF matter_firm IS NOT NULL AND client_firm IS NOT NULL AND matter_firm IS DISTINCT FROM client_firm THEN
    RAISE EXCEPTION 'Invoice matter/client enterprise mismatch';
  END IF;

  resolved_firm := COALESCE(NEW.firm_id, matter_firm, client_firm, active_firm, app_private.get_user_firm_id(NEW.owner_id));

  IF resolved_firm IS NULL THEN
    RAISE EXCEPTION 'Invoice must belong to an enterprise';
  END IF;

  IF matter_firm IS NOT NULL AND matter_firm IS DISTINCT FROM resolved_firm THEN
    RAISE EXCEPTION 'Invoice and matter must belong to the same enterprise';
  END IF;

  IF client_firm IS NOT NULL AND client_firm IS DISTINCT FROM resolved_firm THEN
    RAISE EXCEPTION 'Invoice and client must belong to the same enterprise';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.firm_id IS DISTINCT FROM resolved_firm THEN
    RAISE EXCEPTION 'Changing invoice enterprise is forbidden';
  END IF;

  NEW.firm_id := resolved_firm;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_assign_firm_trg ON public.clients;
CREATE TRIGGER clients_assign_firm_trg
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION app_private.assign_client_firm();

DROP TRIGGER IF EXISTS matters_assign_firm_trg ON public.matters;
CREATE TRIGGER matters_assign_firm_trg
  BEFORE INSERT OR UPDATE ON public.matters
  FOR EACH ROW EXECUTE FUNCTION app_private.assign_matter_firm();

DROP TRIGGER IF EXISTS invoices_assign_firm_trg ON public.invoices;
CREATE TRIGGER invoices_assign_firm_trg
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION app_private.assign_invoice_firm();

REVOKE ALL ON FUNCTION app_private.is_active_firm(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.assign_client_firm() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.assign_matter_firm() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.assign_invoice_firm() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_active_firm(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.assign_client_firm() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.assign_matter_firm() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.assign_invoice_firm() TO authenticated, service_role;

-- Strong restrictive guards (AND-ed with existing policies).
DROP POLICY IF EXISTS clients_active_firm_guard ON public.clients;
CREATE POLICY clients_active_firm_guard ON public.clients
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.is_active_firm(firm_id))
  WITH CHECK (app_private.is_active_firm(firm_id));

DROP POLICY IF EXISTS matters_active_firm_guard ON public.matters;
CREATE POLICY matters_active_firm_guard ON public.matters
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.is_active_firm(firm_id))
  WITH CHECK (app_private.is_active_firm(firm_id));

DROP POLICY IF EXISTS invoices_active_firm_guard ON public.invoices;
CREATE POLICY invoices_active_firm_guard ON public.invoices
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.is_active_firm(firm_id))
  WITH CHECK (app_private.is_active_firm(firm_id));

DROP POLICY IF EXISTS matter_folders_active_firm_guard ON public.matter_folders;
CREATE POLICY matter_folders_active_firm_guard ON public.matter_folders
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)));

DROP POLICY IF EXISTS matter_documents_active_firm_guard ON public.matter_documents;
CREATE POLICY matter_documents_active_firm_guard ON public.matter_documents
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)));

DROP POLICY IF EXISTS matter_activity_active_firm_guard ON public.matter_activity;
CREATE POLICY matter_activity_active_firm_guard ON public.matter_activity
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)));

DROP POLICY IF EXISTS matter_assistants_active_firm_guard ON public.matter_assistants;
CREATE POLICY matter_assistants_active_firm_guard ON public.matter_assistants
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)));

DROP POLICY IF EXISTS matter_tasks_active_firm_guard ON public.matter_tasks;
CREATE POLICY matter_tasks_active_firm_guard ON public.matter_tasks
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)));

DROP POLICY IF EXISTS matter_clients_active_firm_guard ON public.matter_clients;
CREATE POLICY matter_clients_active_firm_guard ON public.matter_clients
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)));

DROP POLICY IF EXISTS matter_messages_active_firm_guard ON public.matter_messages;
CREATE POLICY matter_messages_active_firm_guard ON public.matter_messages
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND app_private.is_active_firm(m.firm_id)));

DROP POLICY IF EXISTS invoice_items_active_firm_guard ON public.invoice_items;
CREATE POLICY invoice_items_active_firm_guard ON public.invoice_items
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)));

DROP POLICY IF EXISTS invoice_payments_active_firm_guard ON public.invoice_payments;
CREATE POLICY invoice_payments_active_firm_guard ON public.invoice_payments
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)));

DROP POLICY IF EXISTS signature_links_active_firm_guard ON public.signature_links;
CREATE POLICY signature_links_active_firm_guard ON public.signature_links
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)));

DROP POLICY IF EXISTS signature_events_active_firm_guard ON public.signature_events;
CREATE POLICY signature_events_active_firm_guard ON public.signature_events
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)));

DROP POLICY IF EXISTS document_signatures_active_firm_guard ON public.document_signatures;
CREATE POLICY document_signatures_active_firm_guard ON public.document_signatures
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND app_private.is_active_firm(i.firm_id)));

DROP POLICY IF EXISTS client_conversations_active_firm_guard ON public.client_conversations;
CREATE POLICY client_conversations_active_firm_guard ON public.client_conversations
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (app_private.is_active_firm(firm_id))
  WITH CHECK (app_private.is_active_firm(firm_id));

DROP POLICY IF EXISTS client_conv_messages_active_firm_guard ON public.client_conversation_messages;
CREATE POLICY client_conv_messages_active_firm_guard ON public.client_conversation_messages
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_conversations c
      WHERE c.id = conversation_id
        AND app_private.is_active_firm(c.firm_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_conversations c
      WHERE c.id = conversation_id
        AND app_private.is_active_firm(c.firm_id)
    )
  );

-- Update access helpers used by existing policies and server-side checks.
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
        AND app_private.is_active_firm(m.firm_id)
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
      AND app_private.is_active_firm(i.firm_id)
      AND app_private.can_access_owned(i.owner_id)
      AND (
        (i.kind = 'quote' AND app_private.user_has_active_module('quotes'))
        OR (i.kind <> 'quote' AND app_private.user_has_active_module('billing'))
      )
  );
$$;

REVOKE ALL ON FUNCTION app_private.can_access_matter(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_access_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_matter(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_invoice(uuid) TO authenticated, service_role;

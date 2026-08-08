-- Client portal isolation, Discord linking, and general conversations.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS discord_user_id text,
  ADD COLUMN IF NOT EXISTS discord_username text,
  ADD COLUMN IF NOT EXISTS discord_channel_id text;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_discord_user_id_format;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_discord_user_id_format
  CHECK (discord_user_id IS NULL OR discord_user_id ~ '^[0-9]{15,25}$');

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_discord_channel_id_format;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_discord_channel_id_format
  CHECK (discord_channel_id IS NULL OR discord_channel_id ~ '^[0-9]{15,25}$');

CREATE UNIQUE INDEX IF NOT EXISTS clients_discord_user_id_key
  ON public.clients(discord_user_id)
  WHERE discord_user_id IS NOT NULL;

-- Tighten client-facing policies to the dedicated `client` role.
DROP POLICY IF EXISTS clients_self_read ON public.clients;
CREATE POLICY clients_self_read ON public.clients FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid());

DROP POLICY IF EXISTS clients_self_update ON public.clients;
CREATE POLICY clients_self_update ON public.clients FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid())
  WITH CHECK (app_private.has_role(auth.uid(), 'client') AND profile_id = auth.uid());

DROP POLICY IF EXISTS matters_client_read ON public.matters;
CREATE POLICY matters_client_read ON public.matters FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'client') AND app_private.is_client_matter(id, auth.uid()));

DROP POLICY IF EXISTS matter_activity_client_read ON public.matter_activity;
CREATE POLICY matter_activity_client_read ON public.matter_activity FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'client') AND app_private.is_client_matter(matter_id, auth.uid()));

DROP POLICY IF EXISTS matter_documents_client_read ON public.matter_documents;
CREATE POLICY matter_documents_client_read ON public.matter_documents FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'client')
    AND shared_with_client = true
    AND app_private.is_client_matter(matter_id, auth.uid())
  );

DROP POLICY IF EXISTS matter_documents_client_insert ON public.matter_documents;
CREATE POLICY matter_documents_client_insert ON public.matter_documents FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'client')
    AND uploaded_by = auth.uid()
    AND uploaded_by_client = true
    AND shared_with_client = true
    AND app_private.is_client_matter(matter_id, auth.uid())
  );

DROP POLICY IF EXISTS matter_messages_client_read ON public.matter_messages;
CREATE POLICY matter_messages_client_read ON public.matter_messages FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'client')
    AND internal = false
    AND app_private.is_client_matter(matter_id, auth.uid())
  );

DROP POLICY IF EXISTS matter_messages_client_insert ON public.matter_messages;
CREATE POLICY matter_messages_client_insert ON public.matter_messages FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'client')
    AND internal = false
    AND author_id = auth.uid()
    AND app_private.is_client_matter(matter_id, auth.uid())
  );

DROP POLICY IF EXISTS invoices_client_read ON public.invoices;
CREATE POLICY invoices_client_read ON public.invoices FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'client') AND app_private.is_client_invoice(id, auth.uid()));

DROP POLICY IF EXISTS invoice_items_client_read ON public.invoice_items;
CREATE POLICY invoice_items_client_read ON public.invoice_items FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'client')
    AND app_private.is_client_invoice(invoice_id, auth.uid())
  );

DROP POLICY IF EXISTS bar_media_client_read ON storage.objects;
CREATE POLICY bar_media_client_read ON storage.objects FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'client')
    AND bucket_id = 'bar-media'
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
    app_private.has_role(auth.uid(), 'client')
    AND bucket_id = 'bar-media'
    AND name LIKE 'matters/%'
    AND app_private.is_client_matter(NULLIF(split_part(name, '/', 2), '')::uuid, auth.uid())
  );

-- General conversation outside dossier.
CREATE TABLE IF NOT EXISTS public.client_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES public.matters(id) ON DELETE SET NULL,
  subject text NOT NULL DEFAULT 'Contacter l''entreprise',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'attached', 'closed')),
  client_last_read_at timestamptz,
  staff_last_read_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_conversations_client_idx ON public.client_conversations(client_id);
CREATE INDEX IF NOT EXISTS client_conversations_firm_idx ON public.client_conversations(firm_id);
CREATE INDEX IF NOT EXISTS client_conversations_matter_idx ON public.client_conversations(matter_id);

CREATE TABLE IF NOT EXISTS public.client_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.client_conversations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_conv_messages_conv_idx
  ON public.client_conversation_messages(conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_conversations TO authenticated;
GRANT ALL ON public.client_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_conversation_messages TO authenticated;
GRANT ALL ON public.client_conversation_messages TO service_role;

ALTER TABLE public.client_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_private.is_client_profile(_client_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = _client_id
      AND c.profile_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_client_profile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_client_profile(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS client_conversations_staff_all ON public.client_conversations;
CREATE POLICY client_conversations_staff_all ON public.client_conversations FOR ALL TO authenticated
  USING (app_private.can_manage_firm_clients(firm_id, auth.uid()))
  WITH CHECK (app_private.can_manage_firm_clients(firm_id, auth.uid()));

DROP POLICY IF EXISTS client_conversations_client_select ON public.client_conversations;
CREATE POLICY client_conversations_client_select ON public.client_conversations FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'client') AND app_private.is_client_profile(client_id, auth.uid()));

DROP POLICY IF EXISTS client_conversations_client_insert ON public.client_conversations;
CREATE POLICY client_conversations_client_insert ON public.client_conversations FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'client')
    AND created_by = auth.uid()
    AND app_private.is_client_profile(client_id, auth.uid())
  );

DROP POLICY IF EXISTS client_conversations_client_update ON public.client_conversations;
CREATE POLICY client_conversations_client_update ON public.client_conversations FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'client') AND app_private.is_client_profile(client_id, auth.uid()))
  WITH CHECK (app_private.has_role(auth.uid(), 'client') AND app_private.is_client_profile(client_id, auth.uid()));

DROP POLICY IF EXISTS client_conv_messages_staff_all ON public.client_conversation_messages;
CREATE POLICY client_conv_messages_staff_all ON public.client_conversation_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_conversations c
      WHERE c.id = conversation_id
        AND app_private.can_manage_firm_clients(c.firm_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_conversations c
      WHERE c.id = conversation_id
        AND app_private.can_manage_firm_clients(c.firm_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS client_conv_messages_client_select ON public.client_conversation_messages;
CREATE POLICY client_conv_messages_client_select ON public.client_conversation_messages FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'client')
    AND EXISTS (
      SELECT 1 FROM public.client_conversations c
      WHERE c.id = conversation_id
        AND app_private.is_client_profile(c.client_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS client_conv_messages_client_insert ON public.client_conversation_messages;
CREATE POLICY client_conv_messages_client_insert ON public.client_conversation_messages FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'client')
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.client_conversations c
      WHERE c.id = conversation_id
        AND app_private.is_client_profile(c.client_id, auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION app_private.protect_client_conversation_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF app_private.has_role(auth.uid(), 'client') THEN
    NEW.client_id := OLD.client_id;
    NEW.firm_id := OLD.firm_id;
    NEW.matter_id := OLD.matter_id;
    NEW.status := OLD.status;
    NEW.subject := OLD.subject;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.protect_client_conversation_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.protect_client_conversation_update() TO authenticated, service_role;

DROP TRIGGER IF EXISTS client_conversations_touch ON public.client_conversations;
CREATE TRIGGER client_conversations_touch
  BEFORE UPDATE ON public.client_conversations
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_client_conversation_update();

DROP TRIGGER IF EXISTS client_conversation_messages_touch ON public.client_conversation_messages;
CREATE TRIGGER client_conversation_messages_touch
  BEFORE UPDATE ON public.client_conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

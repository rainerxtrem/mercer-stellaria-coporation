
-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  birth_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_owner_idx ON public.clients(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_owner_all ON public.clients FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'));
CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ MATTERS ============
CREATE TABLE public.matters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  type TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','closed','archived')),
  opened_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX matters_owner_idx ON public.matters(owner_id);
CREATE INDEX matters_client_idx ON public.matters(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matters TO authenticated;
GRANT ALL ON public.matters TO service_role;
ALTER TABLE public.matters ENABLE ROW LEVEL SECURITY;
CREATE POLICY matters_owner_all ON public.matters FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'));
CREATE TRIGGER matters_set_updated_at BEFORE UPDATE ON public.matters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-numbering: SA-YYYY-NNNNN (padded 5)
CREATE OR REPLACE FUNCTION public.matters_set_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM COALESCE(NEW.opened_on, CURRENT_DATE));
  seq INT;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '^SA-\d{4}-', ''), '')::INT), 0) + 1
    INTO seq FROM public.matters WHERE number LIKE 'SA-' || y || '-%';
  NEW.number := 'SA-' || y || '-' || lpad(seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;
CREATE TRIGGER matters_number_trg BEFORE INSERT ON public.matters
  FOR EACH ROW EXECUTE FUNCTION public.matters_set_number();

-- ============ CAN ACCESS MATTER HELPER ============
CREATE OR REPLACE FUNCTION public.can_access_matter(_matter_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matters m
    WHERE m.id = _matter_id
      AND (m.owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'))
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_access_matter(UUID) TO authenticated;

-- ============ MATTER FOLDERS (recursive) ============
CREATE TABLE public.matter_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.matter_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX matter_folders_matter_idx ON public.matter_folders(matter_id);
CREATE INDEX matter_folders_parent_idx ON public.matter_folders(parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matter_folders TO authenticated;
GRANT ALL ON public.matter_folders TO service_role;
ALTER TABLE public.matter_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY matter_folders_access ON public.matter_folders FOR ALL TO authenticated
  USING (public.can_access_matter(matter_id))
  WITH CHECK (public.can_access_matter(matter_id));
CREATE TRIGGER matter_folders_set_updated_at BEFORE UPDATE ON public.matter_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ MATTER DOCUMENTS ============
CREATE TABLE public.matter_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.matter_folders(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  tags TEXT[] NOT NULL DEFAULT '{}',
  comment TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX matter_documents_matter_idx ON public.matter_documents(matter_id);
CREATE INDEX matter_documents_folder_idx ON public.matter_documents(folder_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matter_documents TO authenticated;
GRANT ALL ON public.matter_documents TO service_role;
ALTER TABLE public.matter_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY matter_documents_access ON public.matter_documents FOR ALL TO authenticated
  USING (public.can_access_matter(matter_id))
  WITH CHECK (public.can_access_matter(matter_id));
CREATE TRIGGER matter_documents_set_updated_at BEFORE UPDATE ON public.matter_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ MATTER ACTIVITY ============
CREATE TABLE public.matter_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX matter_activity_matter_idx ON public.matter_activity(matter_id, created_at DESC);
GRANT SELECT, INSERT ON public.matter_activity TO authenticated;
GRANT ALL ON public.matter_activity TO service_role;
ALTER TABLE public.matter_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY matter_activity_read ON public.matter_activity FOR SELECT TO authenticated
  USING (public.can_access_matter(matter_id));
CREATE POLICY matter_activity_insert ON public.matter_activity FOR INSERT TO authenticated
  WITH CHECK (public.can_access_matter(matter_id) AND actor_id = auth.uid());

-- ============ STORAGE POLICIES for bar-media/matters/* ============
-- Path convention: matters/<matter_uuid>/<document_uuid>-<filename>
DROP POLICY IF EXISTS bar_media_matters_select ON storage.objects;
DROP POLICY IF EXISTS bar_media_matters_insert ON storage.objects;
DROP POLICY IF EXISTS bar_media_matters_update ON storage.objects;
DROP POLICY IF EXISTS bar_media_matters_delete ON storage.objects;

CREATE POLICY bar_media_matters_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bar-media'
    AND (storage.foldername(name))[1] = 'matters'
    AND public.can_access_matter(((storage.foldername(name))[2])::uuid)
  );
CREATE POLICY bar_media_matters_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bar-media'
    AND (storage.foldername(name))[1] = 'matters'
    AND public.can_access_matter(((storage.foldername(name))[2])::uuid)
  );
CREATE POLICY bar_media_matters_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bar-media'
    AND (storage.foldername(name))[1] = 'matters'
    AND public.can_access_matter(((storage.foldername(name))[2])::uuid)
  );
CREATE POLICY bar_media_matters_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'bar-media'
    AND (storage.foldername(name))[1] = 'matters'
    AND public.can_access_matter(((storage.foldername(name))[2])::uuid)
  );

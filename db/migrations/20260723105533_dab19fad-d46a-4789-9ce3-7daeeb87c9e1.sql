
-- Generic audit trigger
CREATE OR REPLACE FUNCTION public.audit_log_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity TEXT := TG_TABLE_NAME;
  v_action TEXT := lower(TG_OP);
  v_id UUID;
  v_summary TEXT;
  v_changes JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := (to_jsonb(OLD)->>'id')::UUID;
    v_changes := to_jsonb(OLD);
    v_summary := coalesce(to_jsonb(OLD)->>'title', to_jsonb(OLD)->>'name', to_jsonb(OLD)->>'number', to_jsonb(OLD)->>'subject', to_jsonb(OLD)->>'last_name');
  ELSE
    v_id := (to_jsonb(NEW)->>'id')::UUID;
    v_changes := to_jsonb(NEW);
    v_summary := coalesce(to_jsonb(NEW)->>'title', to_jsonb(NEW)->>'name', to_jsonb(NEW)->>'number', to_jsonb(NEW)->>'subject', to_jsonb(NEW)->>'last_name');
  END IF;

  INSERT INTO public.audit_log (actor_id, entity_type, entity_id, action, summary, changes)
  VALUES (auth.uid(), v_entity, v_id, v_action, v_summary, v_changes);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Allow the definer function to bypass RLS for insert
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;

-- Attach triggers to key tables (drop-if-exists then create)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'matters','invoices','clients','lawyers','firms','news',
    'library_articles','library_categories','bar_exams','trainings',
    'training_modules','user_roles','contact_requests','site_content'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.audit_log_row()', t);
  END LOOP;
END $$;

-- Backups metadata table
CREATE TABLE IF NOT EXISTS public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backups_admin_all ON public.backups;
CREATE POLICY backups_admin_all ON public.backups
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));

CREATE INDEX IF NOT EXISTS backups_created_at_idx ON public.backups (created_at DESC);

-- Storage policies: batonnier can manage bar-media/backups/*
DROP POLICY IF EXISTS "backups_admin_read" ON storage.objects;
CREATE POLICY "backups_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bar-media' AND (name LIKE 'backups/%') AND app_private.has_role(auth.uid(), 'batonnier'));

DROP POLICY IF EXISTS "backups_admin_write" ON storage.objects;
CREATE POLICY "backups_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bar-media' AND (name LIKE 'backups/%') AND app_private.has_role(auth.uid(), 'batonnier'));

DROP POLICY IF EXISTS "backups_admin_delete" ON storage.objects;
CREATE POLICY "backups_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bar-media' AND (name LIKE 'backups/%') AND app_private.has_role(auth.uid(), 'batonnier'));

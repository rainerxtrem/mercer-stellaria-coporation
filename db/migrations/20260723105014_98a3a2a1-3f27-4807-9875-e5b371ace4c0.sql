
-- 1) Unify can_access_matter to include assistants
CREATE OR REPLACE FUNCTION public.can_access_matter(_matter_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matters m
    WHERE m.id = _matter_id
      AND (
        m.owner_id = auth.uid()
        OR app_private.has_role(auth.uid(), 'batonnier')
        OR EXISTS (SELECT 1 FROM public.matter_assistants a WHERE a.matter_id = _matter_id AND a.user_id = auth.uid())
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_access_matter(uuid) TO authenticated;

-- 2) Split matters policy: owner/batonnier = ALL, assistants = SELECT only
DROP POLICY IF EXISTS matters_owner_all ON public.matters;
CREATE POLICY matters_owner_manage ON public.matters FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'));
CREATE POLICY matters_assistant_read ON public.matters FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matter_assistants a WHERE a.matter_id = id AND a.user_id = auth.uid()));

-- 3) matter_tasks
CREATE TABLE IF NOT EXISTS public.matter_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date DATE,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS matter_tasks_matter_idx ON public.matter_tasks(matter_id);
CREATE INDEX IF NOT EXISTS matter_tasks_assignee_idx ON public.matter_tasks(assignee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matter_tasks TO authenticated;
GRANT ALL ON public.matter_tasks TO service_role;
ALTER TABLE public.matter_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY matter_tasks_read ON public.matter_tasks FOR SELECT TO authenticated
  USING (public.can_access_matter(matter_id));
CREATE POLICY matter_tasks_insert ON public.matter_tasks FOR INSERT TO authenticated
  WITH CHECK (public.can_access_matter(matter_id) AND created_by = auth.uid());
CREATE POLICY matter_tasks_update ON public.matter_tasks FOR UPDATE TO authenticated
  USING (
    public.can_access_matter(matter_id) AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND m.owner_id = auth.uid())
      OR app_private.has_role(auth.uid(), 'batonnier')
    )
  )
  WITH CHECK (public.can_access_matter(matter_id));
CREATE POLICY matter_tasks_delete ON public.matter_tasks FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND m.owner_id = auth.uid())
    OR app_private.has_role(auth.uid(), 'batonnier')
  );

CREATE TRIGGER matter_tasks_set_updated_at BEFORE UPDATE ON public.matter_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Notify assistant when added
CREATE OR REPLACE FUNCTION public.notify_matter_assistant_added()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD;
BEGIN
  SELECT title, number INTO m FROM public.matters WHERE id = NEW.matter_id;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (
    NEW.user_id,
    'matter_shared',
    'Nouveau dossier partagé',
    COALESCE(m.number, '') || ' — ' || COALESCE(m.title, 'Dossier'),
    '/dossiers/' || NEW.matter_id,
    'matter',
    NEW.matter_id
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS matter_assistants_notify ON public.matter_assistants;
CREATE TRIGGER matter_assistants_notify AFTER INSERT ON public.matter_assistants
  FOR EACH ROW EXECUTE FUNCTION public.notify_matter_assistant_added();

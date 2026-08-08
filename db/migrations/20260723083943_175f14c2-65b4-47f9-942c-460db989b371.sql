
-- ============ FIX FUNCTION GRANTS ============
GRANT EXECUTE ON FUNCTION app_private.can_access_matter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;

-- ============ ASSISTANT ROLE ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'assistant' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'assistant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'avocat' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'avocat';
  END IF;
END $$;

-- ============ MATTER ASSISTANTS ============
CREATE TABLE IF NOT EXISTS public.matter_assistants (
  matter_id UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (matter_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.matter_assistants TO authenticated;
GRANT ALL ON public.matter_assistants TO service_role;
ALTER TABLE public.matter_assistants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matter_assistants_owner_manage" ON public.matter_assistants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND m.owner_id = auth.uid())
    OR app_private.has_role(auth.uid(), 'batonnier')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_id AND m.owner_id = auth.uid())
    OR app_private.has_role(auth.uid(), 'batonnier')
  );
CREATE POLICY "matter_assistants_self_read" ON public.matter_assistants
  FOR SELECT USING (user_id = auth.uid());

-- ============ UPDATE can_access_matter TO INCLUDE ASSISTANTS ============
CREATE OR REPLACE FUNCTION app_private.can_access_matter(_matter_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
GRANT EXECUTE ON FUNCTION app_private.can_access_matter(uuid) TO authenticated;

-- ============ TRAININGS ============
CREATE TABLE IF NOT EXISTS public.training_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.training_categories TO authenticated;
GRANT ALL ON public.training_categories TO service_role;
ALTER TABLE public.training_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training_categories_read" ON public.training_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "training_categories_admin_all" ON public.training_categories FOR ALL
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));

CREATE TABLE IF NOT EXISTS public.trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category_id UUID REFERENCES public.training_categories(id) ON DELETE SET NULL,
  points INT NOT NULL DEFAULT 0,
  pass_threshold INT NOT NULL DEFAULT 70,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trainings TO authenticated;
GRANT ALL ON public.trainings TO service_role;
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trainings_read_published" ON public.trainings FOR SELECT TO authenticated
  USING (status = 'published' OR app_private.has_role(auth.uid(), 'batonnier'));
CREATE POLICY "trainings_admin_all" ON public.trainings FOR ALL
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));
CREATE TRIGGER trg_trainings_updated BEFORE UPDATE ON public.trainings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.training_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  prompt TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('single','multi','boolean')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.training_questions TO authenticated;
GRANT ALL ON public.training_questions TO service_role;
ALTER TABLE public.training_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training_questions_read" ON public.training_questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = training_id AND (t.status='published' OR app_private.has_role(auth.uid(),'batonnier'))));
CREATE POLICY "training_questions_admin" ON public.training_questions FOR ALL
  USING (app_private.has_role(auth.uid(),'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(),'batonnier'));

CREATE TABLE IF NOT EXISTS public.training_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.training_questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.training_choices TO authenticated;
GRANT ALL ON public.training_choices TO service_role;
ALTER TABLE public.training_choices ENABLE ROW LEVEL SECURITY;
-- Avocats voient les intitulés mais pas is_correct : on filtre côté server fn (retour SELECT sans is_correct)
CREATE POLICY "training_choices_read" ON public.training_choices FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.training_questions q
    JOIN public.trainings t ON t.id = q.training_id
    WHERE q.id = question_id AND (t.status='published' OR app_private.has_role(auth.uid(),'batonnier'))
  ));
CREATE POLICY "training_choices_admin" ON public.training_choices FOR ALL
  USING (app_private.has_role(auth.uid(),'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(),'batonnier'));

CREATE TABLE IF NOT EXISTS public.training_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  points_awarded INT NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.training_attempts TO authenticated;
GRANT ALL ON public.training_attempts TO service_role;
ALTER TABLE public.training_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training_attempts_self_read" ON public.training_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.has_role(auth.uid(),'batonnier'));
CREATE POLICY "training_attempts_self_insert" ON public.training_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "training_attempts_admin_update" ON public.training_attempts FOR UPDATE
  USING (app_private.has_role(auth.uid(),'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(),'batonnier'));

CREATE TABLE IF NOT EXISTS public.training_manual_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.training_attempts(id) ON DELETE CASCADE,
  delta_points INT NOT NULL,
  reason TEXT,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.training_manual_adjustments TO authenticated;
GRANT ALL ON public.training_manual_adjustments TO service_role;
ALTER TABLE public.training_manual_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training_adj_admin" ON public.training_manual_adjustments FOR ALL
  USING (app_private.has_role(auth.uid(),'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(),'batonnier'));
CREATE POLICY "training_adj_self_read" ON public.training_manual_adjustments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid()));

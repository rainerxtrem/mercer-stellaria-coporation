
-- 1) handle_new_user : lien automatique avocat invité <-> compte auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email))
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'citoyen')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF NEW.email IS NOT NULL THEN
    UPDATE public.lawyers
       SET profile_id = NEW.id
     WHERE lower(email) = lower(NEW.email)
       AND profile_id IS NULL;

    IF FOUND THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'avocat')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS lawyers_email_lower_idx ON public.lawyers (lower(email));

-- 2) Complète la table trainings
ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS duration_min INT NOT NULL DEFAULT 30;

ALTER TABLE public.training_attempts
  ADD COLUMN IF NOT EXISTS max_score INT NOT NULL DEFAULT 0;

-- 3) Modules pédagogiques
CREATE TABLE IF NOT EXISTS public.training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  content TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_modules_training_idx ON public.training_modules(training_id);

GRANT SELECT ON public.training_modules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_modules TO authenticated;
GRANT ALL ON public.training_modules TO service_role;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_modules_public_read" ON public.training_modules;
DROP POLICY IF EXISTS "training_modules_admin_all" ON public.training_modules;

CREATE POLICY "training_modules_public_read"
  ON public.training_modules FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = training_id AND t.status = 'published'));
CREATE POLICY "training_modules_admin_all"
  ON public.training_modules FOR ALL
  USING (public.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (public.has_role(auth.uid(), 'batonnier'));

DROP TRIGGER IF EXISTS training_modules_updated ON public.training_modules;
CREATE TRIGGER training_modules_updated BEFORE UPDATE ON public.training_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Ouvre la lecture publique des formations publiées (anon) - description et catégorie uniquement, sans quiz
GRANT SELECT ON public.trainings TO anon;
GRANT SELECT ON public.training_categories TO anon;
GRANT SELECT ON public.training_modules TO anon;

DROP POLICY IF EXISTS "trainings_read_public" ON public.trainings;
CREATE POLICY "trainings_read_public"
  ON public.trainings FOR SELECT
  TO anon
  USING (status = 'published');

DROP POLICY IF EXISTS "training_categories_read_public" ON public.training_categories;
CREATE POLICY "training_categories_read_public"
  ON public.training_categories FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "training_modules_read_public" ON public.training_modules;
CREATE POLICY "training_modules_read_public"
  ON public.training_modules FOR SELECT
  TO anon
  USING (EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = training_id AND t.status = 'published'));


-- Enums
DO $$ BEGIN
  CREATE TYPE public.bar_exam_status AS ENUM ('draft','open','closed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bar_question_type AS ENUM ('single','multiple','truefalse','short','essay');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bar_attempt_status AS ENUM ('in_progress','submitted','graded','admitted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table: bar_exams
CREATE TABLE public.bar_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  duration_min int NOT NULL DEFAULT 60 CHECK (duration_min > 0),
  opens_at timestamptz,
  closes_at timestamptz,
  status public.bar_exam_status NOT NULL DEFAULT 'draft',
  pass_threshold_pct int NOT NULL DEFAULT 60 CHECK (pass_threshold_pct BETWEEN 0 AND 100),
  total_points numeric(10,2) NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  show_results_to_candidate boolean NOT NULL DEFAULT true,
  auto_publish_results boolean NOT NULL DEFAULT false,
  shuffle_questions boolean NOT NULL DEFAULT false,
  shuffle_answers boolean NOT NULL DEFAULT false,
  access_code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  access_code_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_exams TO authenticated;
GRANT ALL ON public.bar_exams TO service_role;
ALTER TABLE public.bar_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bar_exams_batonnier_all" ON public.bar_exams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'batonnier'))
  WITH CHECK (public.has_role(auth.uid(),'batonnier'));

-- Candidates can see only minimal info about open exams (name, description, duration, dates)
CREATE POLICY "bar_exams_open_read" ON public.bar_exams FOR SELECT TO authenticated
  USING (status = 'open');

CREATE TRIGGER bar_exams_touch BEFORE UPDATE ON public.bar_exams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Table: bar_exam_questions
CREATE TABLE public.bar_exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.bar_exams(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  type public.bar_question_type NOT NULL DEFAULT 'single',
  points numeric(10,2) NOT NULL DEFAULT 1 CHECK (points >= 0),
  explanation text,
  category text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_exam_questions TO authenticated;
GRANT ALL ON public.bar_exam_questions TO service_role;
ALTER TABLE public.bar_exam_questions ENABLE ROW LEVEL SECURITY;

-- Only Bâtonnier reads/writes questions directly. Candidates get sanitized copy via server fn.
CREATE POLICY "bar_questions_batonnier_all" ON public.bar_exam_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'batonnier'))
  WITH CHECK (public.has_role(auth.uid(),'batonnier'));

CREATE INDEX bar_questions_exam_idx ON public.bar_exam_questions(exam_id, position);
CREATE TRIGGER bar_questions_touch BEFORE UPDATE ON public.bar_exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Table: bar_exam_choices
CREATE TABLE public.bar_exam_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.bar_exam_questions(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  points_override numeric(10,2),
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_exam_choices TO authenticated;
GRANT ALL ON public.bar_exam_choices TO service_role;
ALTER TABLE public.bar_exam_choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bar_choices_batonnier_all" ON public.bar_exam_choices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'batonnier'))
  WITH CHECK (public.has_role(auth.uid(),'batonnier'));

CREATE INDEX bar_choices_question_idx ON public.bar_exam_choices(question_id, position);

-- Table: bar_exam_attempts
CREATE TABLE public.bar_exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.bar_exams(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  auto_submitted boolean NOT NULL DEFAULT false,
  status public.bar_attempt_status NOT NULL DEFAULT 'in_progress',
  score_points numeric(10,2),
  total_points numeric(10,2),
  score_pct numeric(5,2),
  passed boolean,
  correct_count int,
  wrong_count int,
  needs_manual_grading boolean NOT NULL DEFAULT false,
  batonnier_comment text,
  graded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_exam_attempts TO authenticated;
GRANT ALL ON public.bar_exam_attempts TO service_role;
ALTER TABLE public.bar_exam_attempts ENABLE ROW LEVEL SECURITY;

-- Only one in_progress attempt per (exam, candidate)
CREATE UNIQUE INDEX bar_attempts_active_uniq
  ON public.bar_exam_attempts(exam_id, candidate_id)
  WHERE status = 'in_progress';

CREATE INDEX bar_attempts_exam_idx ON public.bar_exam_attempts(exam_id);
CREATE INDEX bar_attempts_candidate_idx ON public.bar_exam_attempts(candidate_id);

CREATE POLICY "bar_attempts_batonnier_all" ON public.bar_exam_attempts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'batonnier'))
  WITH CHECK (public.has_role(auth.uid(),'batonnier'));

CREATE POLICY "bar_attempts_candidate_read" ON public.bar_exam_attempts FOR SELECT TO authenticated
  USING (candidate_id = auth.uid());

CREATE TRIGGER bar_attempts_touch BEFORE UPDATE ON public.bar_exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Table: bar_exam_answers
CREATE TABLE public.bar_exam_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.bar_exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.bar_exam_questions(id) ON DELETE CASCADE,
  choice_ids uuid[] NOT NULL DEFAULT '{}',
  text_answer text,
  awarded_points numeric(10,2),
  is_correct boolean,
  manually_graded boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_exam_answers TO authenticated;
GRANT ALL ON public.bar_exam_answers TO service_role;
ALTER TABLE public.bar_exam_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bar_answers_batonnier_all" ON public.bar_exam_answers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'batonnier'))
  WITH CHECK (public.has_role(auth.uid(),'batonnier'));

CREATE POLICY "bar_answers_candidate_read" ON public.bar_exam_answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bar_exam_attempts a WHERE a.id = attempt_id AND a.candidate_id = auth.uid()));

CREATE TRIGGER bar_answers_touch BEFORE UPDATE ON public.bar_exam_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Table: bar_exam_audit
CREATE TABLE public.bar_exam_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES public.bar_exams(id) ON DELETE SET NULL,
  attempt_id uuid REFERENCES public.bar_exam_attempts(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.bar_exam_audit TO authenticated;
GRANT ALL ON public.bar_exam_audit TO service_role;
ALTER TABLE public.bar_exam_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bar_audit_batonnier_read" ON public.bar_exam_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'batonnier'));
CREATE POLICY "bar_audit_insert" ON public.bar_exam_audit FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR public.has_role(auth.uid(),'batonnier'));

-- Helper: recompute total_points on exam
CREATE OR REPLACE FUNCTION public.bar_exam_recompute_total(_exam_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.bar_exams
    SET total_points = COALESCE((SELECT SUM(points) FROM public.bar_exam_questions WHERE exam_id = _exam_id), 0)
    WHERE id = _exam_id;
$$;
REVOKE EXECUTE ON FUNCTION public.bar_exam_recompute_total(uuid) FROM PUBLIC, anon, authenticated;

-- License auto-numbering for admissions (SA-BAR-YYYY-NNNN)
CREATE OR REPLACE FUNCTION public.next_bar_license()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y int := EXTRACT(YEAR FROM CURRENT_DATE); seq int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(license, '^SA-BAR-\d{4}-',''), '')::int), 0) + 1
    INTO seq FROM public.lawyers WHERE license LIKE 'SA-BAR-' || y || '-%';
  RETURN 'SA-BAR-' || y || '-' || lpad(seq::text, 4, '0');
END $$;
REVOKE EXECUTE ON FUNCTION public.next_bar_license() FROM PUBLIC, anon, authenticated;

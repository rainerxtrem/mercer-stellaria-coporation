
-- Enums
DO $$ BEGIN CREATE TYPE public.disc_complaint_status AS ENUM ('new','under_review','dismissed','referred'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.disc_case_status AS ENUM ('opened','investigation','hearing','decided','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.disc_decision AS ENUM ('dismissal','warning','reprimand','suspension','disbarment'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Complaints
CREATE TABLE IF NOT EXISTS public.disciplinary_complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complainant_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  complainant_name TEXT NOT NULL,
  complainant_email TEXT NOT NULL,
  complainant_phone TEXT,
  lawyer_id UUID REFERENCES public.lawyers(id) ON DELETE SET NULL,
  lawyer_name_input TEXT,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status public.disc_complaint_status NOT NULL DEFAULT 'new',
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.disciplinary_complaints TO authenticated;
GRANT INSERT ON public.disciplinary_complaints TO anon;
GRANT ALL ON public.disciplinary_complaints TO service_role;
ALTER TABLE public.disciplinary_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY disc_complaints_admin_all ON public.disciplinary_complaints
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));

CREATE POLICY disc_complaints_public_insert ON public.disciplinary_complaints
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY disc_complaints_own_select ON public.disciplinary_complaints
  FOR SELECT TO authenticated USING (complainant_user_id = auth.uid());

CREATE TRIGGER disciplinary_complaints_updated_at BEFORE UPDATE ON public.disciplinary_complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cases
CREATE TABLE IF NOT EXISTS public.disciplinary_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT UNIQUE,
  complaint_id UUID REFERENCES public.disciplinary_complaints(id) ON DELETE SET NULL,
  lawyer_id UUID NOT NULL REFERENCES public.lawyers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  status public.disc_case_status NOT NULL DEFAULT 'opened',
  opened_at DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_at DATE,
  rapporteur_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_cases TO authenticated;
GRANT ALL ON public.disciplinary_cases TO service_role;
ALTER TABLE public.disciplinary_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY disc_cases_admin_all ON public.disciplinary_cases
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));

CREATE POLICY disc_cases_lawyer_read ON public.disciplinary_cases
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lawyers l WHERE l.id = disciplinary_cases.lawyer_id AND l.profile_id = auth.uid()));

CREATE TRIGGER disciplinary_cases_updated_at BEFORE UPDATE ON public.disciplinary_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.disciplinary_cases_set_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE y INT := EXTRACT(YEAR FROM COALESCE(NEW.opened_at, CURRENT_DATE)); seq INT;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '^DISC-\d{4}-', ''), '')::INT), 0) + 1
    INTO seq FROM public.disciplinary_cases WHERE number LIKE 'DISC-' || y || '-%';
  NEW.number := 'DISC-' || y || '-' || lpad(seq::TEXT, 5, '0');
  RETURN NEW;
END; $$;

CREATE TRIGGER disciplinary_cases_number BEFORE INSERT ON public.disciplinary_cases
  FOR EACH ROW EXECUTE FUNCTION public.disciplinary_cases_set_number();

-- Hearings
CREATE TABLE IF NOT EXISTS public.disciplinary_hearings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  notes TEXT,
  held BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_hearings TO authenticated;
GRANT ALL ON public.disciplinary_hearings TO service_role;
ALTER TABLE public.disciplinary_hearings ENABLE ROW LEVEL SECURITY;

CREATE POLICY disc_hearings_admin_all ON public.disciplinary_hearings
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));

CREATE POLICY disc_hearings_lawyer_read ON public.disciplinary_hearings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.disciplinary_cases c JOIN public.lawyers l ON l.id = c.lawyer_id WHERE c.id = disciplinary_hearings.case_id AND l.profile_id = auth.uid()));

CREATE TRIGGER disciplinary_hearings_updated_at BEFORE UPDATE ON public.disciplinary_hearings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Decisions
CREATE TABLE IF NOT EXISTS public.disciplinary_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
  decision public.disc_decision NOT NULL,
  motivation TEXT NOT NULL,
  sanction_start DATE,
  sanction_end DATE,
  published BOOLEAN NOT NULL DEFAULT false,
  decided_at DATE NOT NULL DEFAULT CURRENT_DATE,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_decisions TO authenticated;
GRANT SELECT ON public.disciplinary_decisions TO anon;
GRANT ALL ON public.disciplinary_decisions TO service_role;
ALTER TABLE public.disciplinary_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY disc_decisions_admin_all ON public.disciplinary_decisions
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'));

CREATE POLICY disc_decisions_lawyer_read ON public.disciplinary_decisions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.disciplinary_cases c JOIN public.lawyers l ON l.id = c.lawyer_id WHERE c.id = disciplinary_decisions.case_id AND l.profile_id = auth.uid()));

CREATE POLICY disc_decisions_public_read ON public.disciplinary_decisions
  FOR SELECT TO anon, authenticated USING (published = true);

CREATE TRIGGER disciplinary_decisions_updated_at BEFORE UPDATE ON public.disciplinary_decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply sanction on the lawyer when a decision is inserted
CREATE OR REPLACE FUNCTION public.disciplinary_apply_sanction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lawyer UUID;
BEGIN
  SELECT lawyer_id INTO v_lawyer FROM public.disciplinary_cases WHERE id = NEW.case_id;
  IF v_lawyer IS NULL THEN RETURN NEW; END IF;

  IF NEW.decision = 'suspension' THEN
    UPDATE public.lawyers SET status = 'suspended' WHERE id = v_lawyer;
  ELSIF NEW.decision = 'disbarment' THEN
    UPDATE public.lawyers SET status = 'revoked' WHERE id = v_lawyer;
  END IF;

  UPDATE public.disciplinary_cases
    SET status = 'decided', closed_at = COALESCE(closed_at, NEW.decided_at)
    WHERE id = NEW.case_id;

  -- Notify the lawyer if a profile is linked
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  SELECT l.profile_id, 'disciplinary_decision',
         'Décision disciplinaire',
         'Une décision a été prononcée dans un dossier vous concernant.',
         '/espace-avocat', 'disciplinary_case', NEW.case_id
  FROM public.lawyers l WHERE l.id = v_lawyer AND l.profile_id IS NOT NULL;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS disciplinary_apply_sanction ON public.disciplinary_decisions;
CREATE TRIGGER disciplinary_apply_sanction AFTER INSERT ON public.disciplinary_decisions
  FOR EACH ROW EXECUTE FUNCTION public.disciplinary_apply_sanction();

-- Notify batonnier(s) on new complaint
CREATE OR REPLACE FUNCTION public.notify_batonnier_new_complaint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b RECORD;
BEGIN
  FOR b IN SELECT user_id FROM public.user_roles WHERE role = 'batonnier' LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (b.user_id, 'disciplinary_complaint',
      'Nouveau signalement disciplinaire',
      NEW.complainant_name || ' — ' || NEW.subject,
      '/admin/discipline', 'disciplinary_complaint', NEW.id);
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS notify_batonnier_new_complaint ON public.disciplinary_complaints;
CREATE TRIGGER notify_batonnier_new_complaint AFTER INSERT ON public.disciplinary_complaints
  FOR EACH ROW EXECUTE FUNCTION public.notify_batonnier_new_complaint();

-- Public list of published decisions (anonymised names)
CREATE OR REPLACE FUNCTION public.get_public_disciplinary_decisions()
RETURNS TABLE(id UUID, decided_at DATE, decision public.disc_decision, motivation TEXT,
              case_number TEXT, lawyer_initials TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.decided_at, d.decision, d.motivation, c.number,
         upper(left(l.first_name,1) || '.' || left(l.last_name,1) || '.') AS lawyer_initials
  FROM public.disciplinary_decisions d
  JOIN public.disciplinary_cases c ON c.id = d.case_id
  JOIN public.lawyers l ON l.id = c.lawyer_id
  WHERE d.published = true
  ORDER BY d.decided_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_public_disciplinary_decisions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_disciplinary_decisions() TO anon, authenticated;

CREATE INDEX IF NOT EXISTS disc_cases_lawyer_idx ON public.disciplinary_cases(lawyer_id);
CREATE INDEX IF NOT EXISTS disc_hearings_case_idx ON public.disciplinary_hearings(case_id);
CREATE INDEX IF NOT EXISTS disc_decisions_case_idx ON public.disciplinary_decisions(case_id);

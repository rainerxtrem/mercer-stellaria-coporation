
-- ============ CONTACT REQUESTS ============
CREATE TYPE public.contact_status AS ENUM ('nouveau','en_cours','traite','archive');

CREATE TABLE public.contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status public.contact_status NOT NULL DEFAULT 'nouveau',
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_requests TO authenticated;
GRANT INSERT ON public.contact_requests TO anon;
GRANT ALL ON public.contact_requests TO service_role;

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + auth) may submit a contact request
CREATE POLICY "contact_public_insert" ON public.contact_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only Bâtonnier reads / manages
CREATE POLICY "contact_admin_read" ON public.contact_requests
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier'::app_role));

CREATE POLICY "contact_admin_update" ON public.contact_requests
  FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier'::app_role));

CREATE POLICY "contact_admin_delete" ON public.contact_requests
  FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier'::app_role));

CREATE TRIGGER contact_requests_updated_at
  BEFORE UPDATE ON public.contact_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Notify Bâtonniers on new contact requests
CREATE OR REPLACE FUNCTION public.notify_batonnier_new_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b RECORD;
BEGIN
  FOR b IN SELECT user_id FROM public.user_roles WHERE role = 'batonnier' LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, url)
    VALUES (
      b.user_id,
      'contact_request',
      'Nouvelle demande de contact',
      NEW.first_name || ' ' || NEW.last_name || ' — ' || NEW.subject,
      '/admin/demandes'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contact_requests_notify
  AFTER INSERT ON public.contact_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_batonnier_new_contact();

-- ============ PUBLIC LAWYER PROFILE RPC ============
-- Public read of a lawyer profile with safe columns only (no email/phone/address)
CREATE OR REPLACE FUNCTION public.get_public_lawyer(_id UUID)
RETURNS TABLE (
  id UUID,
  license TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  specialty TEXT,
  city TEXT,
  status license_status,
  admitted_on DATE,
  bio TEXT,
  firm_name TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.license, l.first_name, l.last_name, l.photo_url, l.specialty,
         l.city, l.status, l.admitted_on, l.bio, f.name AS firm_name
  FROM public.lawyers l
  LEFT JOIN public.firms f ON f.id = l.firm_id
  WHERE l.id = _id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_lawyer(UUID) TO anon, authenticated;

-- ============ PUBLIC STATS RPC ============
CREATE OR REPLACE FUNCTION public.get_public_stats()
RETURNS TABLE (
  lawyers_total BIGINT,
  firms_total BIGINT,
  licenses_active BIGINT,
  exams_total BIGINT,
  news_published BIGINT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.lawyers),
    (SELECT count(*) FROM public.firms),
    (SELECT count(*) FROM public.lawyers WHERE status = 'active'),
    (SELECT count(*) FROM public.bar_exams),
    (SELECT count(*) FROM public.news WHERE status = 'published');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_stats() TO anon, authenticated;

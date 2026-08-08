
-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('batonnier', 'avocat', 'citoyen');
CREATE TYPE public.license_status AS ENUM ('active', 'suspended', 'revoked');
CREATE TYPE public.publication_status AS ENUM ('draft', 'published', 'archived');

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile + default 'citoyen' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'citoyen');
  RETURN NEW;
END;
$$;

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'batonnier'));
CREATE POLICY "user_roles_manage_admin" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'batonnier')) WITH CHECK (public.has_role(auth.uid(), 'batonnier'));

-- Now that user_roles exists, wire the auth signup trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Timestamp helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== FIRMS =====
CREATE TABLE public.firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  manager TEXT,
  logo_url TEXT,
  status public.license_status NOT NULL DEFAULT 'active',
  created_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.firms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firms TO authenticated;
GRANT ALL ON public.firms TO service_role;
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firms_public_read" ON public.firms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "firms_admin_write" ON public.firms FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'batonnier')) WITH CHECK (public.has_role(auth.uid(), 'batonnier'));
CREATE TRIGGER firms_updated_at BEFORE UPDATE ON public.firms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== LAWYERS =====
CREATE TABLE public.lawyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  license TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  photo_url TEXT,
  firm_id UUID REFERENCES public.firms(id) ON DELETE SET NULL,
  specialty TEXT,
  city TEXT,
  status public.license_status NOT NULL DEFAULT 'active',
  admitted_on DATE NOT NULL DEFAULT CURRENT_DATE,
  email TEXT,
  phone TEXT,
  address TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lawyers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lawyers TO authenticated;
GRANT ALL ON public.lawyers TO service_role;
ALTER TABLE public.lawyers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lawyers_public_read" ON public.lawyers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "lawyers_admin_write" ON public.lawyers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'batonnier')) WITH CHECK (public.has_role(auth.uid(), 'batonnier'));
CREATE POLICY "lawyers_update_own" ON public.lawyers FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE TRIGGER lawyers_updated_at BEFORE UPDATE ON public.lawyers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX lawyers_firm_id_idx ON public.lawyers(firm_id);
CREATE INDEX lawyers_profile_id_idx ON public.lawyers(profile_id);

-- ===== NEWS =====
CREATE TABLE public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  body TEXT,
  tag TEXT,
  cover_url TEXT,
  status public.publication_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.news TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news TO authenticated;
GRANT ALL ON public.news TO service_role;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_public_read_published" ON public.news FOR SELECT TO anon, authenticated USING (status = 'published' OR public.has_role(auth.uid(), 'batonnier'));
CREATE POLICY "news_admin_write" ON public.news FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'batonnier')) WITH CHECK (public.has_role(auth.uid(), 'batonnier'));
CREATE TRIGGER news_updated_at BEFORE UPDATE ON public.news FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== LIBRARY =====
CREATE TABLE public.library_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES public.library_categories(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.library_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_categories TO authenticated;
GRANT ALL ON public.library_categories TO service_role;
ALTER TABLE public.library_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "libcat_public_read" ON public.library_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "libcat_admin_write" ON public.library_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'batonnier')) WITH CHECK (public.has_role(auth.uid(), 'batonnier'));

CREATE TABLE public.library_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.library_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  body TEXT,
  media_url TEXT,
  external_link TEXT,
  status public.publication_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.library_articles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_articles TO authenticated;
GRANT ALL ON public.library_articles TO service_role;
ALTER TABLE public.library_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "libart_public_read" ON public.library_articles FOR SELECT TO anon, authenticated USING (status = 'published' OR public.has_role(auth.uid(), 'batonnier'));
CREATE POLICY "libart_admin_write" ON public.library_articles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'batonnier')) WITH CHECK (public.has_role(auth.uid(), 'batonnier'));
CREATE TRIGGER libart_updated_at BEFORE UPDATE ON public.library_articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== INSTITUTIONAL CONTENT (singleton key/value) =====
CREATE TABLE public.site_content (
  key TEXT PRIMARY KEY,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.site_content TO anon;
GRANT SELECT, INSERT, UPDATE ON public.site_content TO authenticated;
GRANT ALL ON public.site_content TO service_role;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_content_public_read" ON public.site_content FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "site_content_admin_write" ON public.site_content FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'batonnier')) WITH CHECK (public.has_role(auth.uid(), 'batonnier'));
CREATE TRIGGER site_content_updated_at BEFORE UPDATE ON public.site_content FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.site_content (key, title, body) VALUES
  ('admissions', 'Conditions d''admission', E'# Conditions d''admission au Barreau\n\nLe Bâtonnier peut modifier ce contenu depuis l''interface d''administration.'),
  ('aide_juridictionnelle', 'Aide juridictionnelle', E'# Aide juridictionnelle\n\nContenu à personnaliser depuis l''administration.');

-- ===== AUDIT LOG =====
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  summary TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_read" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'batonnier'));
CREATE POLICY "audit_insert_admin" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'batonnier'));
CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);

-- ============ CATEGORIES ============
CREATE TABLE public.doc_template_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.doc_template_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_template_categories TO authenticated;
GRANT ALL ON public.doc_template_categories TO service_role;
ALTER TABLE public.doc_template_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tpl_cat_select_firm" ON public.doc_template_categories
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier') OR firm_id = app_private.get_user_firm_id(auth.uid()));

CREATE POLICY "tpl_cat_insert_manager" ON public.doc_template_categories
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier')
    OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND firm_id = app_private.get_user_firm_id(auth.uid())));

CREATE POLICY "tpl_cat_update_manager" ON public.doc_template_categories
  FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier')
    OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND firm_id = app_private.get_user_firm_id(auth.uid())))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier')
    OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND firm_id = app_private.get_user_firm_id(auth.uid())));

CREATE POLICY "tpl_cat_delete_manager" ON public.doc_template_categories
  FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier')
    OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND firm_id = app_private.get_user_firm_id(auth.uid())));

CREATE TRIGGER trg_tpl_cat_updated BEFORE UPDATE ON public.doc_template_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TEMPLATES ============
CREATE TABLE public.doc_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.doc_template_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'pdf' CHECK (kind IN ('pdf','docx')),
  active boolean NOT NULL DEFAULT true,
  archived boolean NOT NULL DEFAULT false,
  current_version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_templates_firm ON public.doc_templates(firm_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_templates TO authenticated;
GRANT ALL ON public.doc_templates TO service_role;
ALTER TABLE public.doc_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tpl_select_firm" ON public.doc_templates
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier') OR firm_id = app_private.get_user_firm_id(auth.uid()));

CREATE POLICY "tpl_insert_manager" ON public.doc_templates
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier')
    OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND firm_id = app_private.get_user_firm_id(auth.uid())));

CREATE POLICY "tpl_update_manager" ON public.doc_templates
  FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier')
    OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND firm_id = app_private.get_user_firm_id(auth.uid())))
  WITH CHECK (app_private.has_role(auth.uid(), 'batonnier')
    OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND firm_id = app_private.get_user_firm_id(auth.uid())));

CREATE POLICY "tpl_delete_manager" ON public.doc_templates
  FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'batonnier')
    OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND firm_id = app_private.get_user_firm_id(auth.uid())));

CREATE TRIGGER trg_tpl_updated BEFORE UPDATE ON public.doc_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tpl_updated_by BEFORE UPDATE ON public.doc_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();

-- ============ VERSIONS ============
CREATE TABLE public.doc_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.doc_templates(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_text text,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_template_versions TO authenticated;
GRANT ALL ON public.doc_template_versions TO service_role;
ALTER TABLE public.doc_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tpl_ver_select_firm" ON public.doc_template_versions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.doc_templates t WHERE t.id = template_id));

CREATE POLICY "tpl_ver_write_manager" ON public.doc_template_versions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.doc_templates t WHERE t.id = template_id
      AND (app_private.has_role(auth.uid(), 'batonnier')
        OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND t.firm_id = app_private.get_user_firm_id(auth.uid())))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.doc_templates t WHERE t.id = template_id
      AND (app_private.has_role(auth.uid(), 'batonnier')
        OR (app_private.has_role(auth.uid(), 'responsable_cabinet') AND t.firm_id = app_private.get_user_firm_id(auth.uid())))));

CREATE TRIGGER trg_tpl_ver_updated BEFORE UPDATE ON public.doc_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
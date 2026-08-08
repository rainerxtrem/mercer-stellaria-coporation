
-- doc_templates: firm members can write
DROP POLICY IF EXISTS tpl_insert_manager ON public.doc_templates;
DROP POLICY IF EXISTS tpl_update_manager ON public.doc_templates;
DROP POLICY IF EXISTS tpl_delete_manager ON public.doc_templates;

CREATE POLICY tpl_insert_firm ON public.doc_templates FOR INSERT TO authenticated
  WITH CHECK (firm_id IS NOT NULL AND firm_id = app_private.get_user_firm_id(auth.uid()));
CREATE POLICY tpl_update_firm ON public.doc_templates FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(),'batonnier') OR firm_id = app_private.get_user_firm_id(auth.uid()))
  WITH CHECK (app_private.has_role(auth.uid(),'batonnier') OR firm_id = app_private.get_user_firm_id(auth.uid()));
CREATE POLICY tpl_delete_firm ON public.doc_templates FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(),'batonnier') OR firm_id = app_private.get_user_firm_id(auth.uid()));

-- categories
DROP POLICY IF EXISTS tpl_cat_insert_manager ON public.doc_template_categories;
DROP POLICY IF EXISTS tpl_cat_update_manager ON public.doc_template_categories;
DROP POLICY IF EXISTS tpl_cat_delete_manager ON public.doc_template_categories;

CREATE POLICY tpl_cat_insert_firm ON public.doc_template_categories FOR INSERT TO authenticated
  WITH CHECK (firm_id IS NOT NULL AND firm_id = app_private.get_user_firm_id(auth.uid()));
CREATE POLICY tpl_cat_update_firm ON public.doc_template_categories FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(),'batonnier') OR firm_id = app_private.get_user_firm_id(auth.uid()))
  WITH CHECK (app_private.has_role(auth.uid(),'batonnier') OR firm_id = app_private.get_user_firm_id(auth.uid()));
CREATE POLICY tpl_cat_delete_firm ON public.doc_template_categories FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(),'batonnier') OR firm_id = app_private.get_user_firm_id(auth.uid()));

-- versions
DROP POLICY IF EXISTS tpl_ver_write_manager ON public.doc_template_versions;
CREATE POLICY tpl_ver_write_firm ON public.doc_template_versions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.doc_templates t WHERE t.id = doc_template_versions.template_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.doc_templates t WHERE t.id = doc_template_versions.template_id));

-- storage: firm-templates bucket scoped by firm id prefix
DROP POLICY IF EXISTS "firm_templates_manager_all" ON storage.objects;
DROP POLICY IF EXISTS "firm_templates_read" ON storage.objects;
DROP POLICY IF EXISTS "firm_templates_write" ON storage.objects;
DROP POLICY IF EXISTS "firm_templates_update" ON storage.objects;
DROP POLICY IF EXISTS "firm_templates_delete" ON storage.objects;

CREATE POLICY "firm_templates_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'firm-templates' AND (
    app_private.has_role(auth.uid(),'batonnier')
    OR (storage.foldername(name))[1] = app_private.get_user_firm_id(auth.uid())::text));
CREATE POLICY "firm_templates_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'firm-templates' AND (
    app_private.has_role(auth.uid(),'batonnier')
    OR (storage.foldername(name))[1] = app_private.get_user_firm_id(auth.uid())::text));
CREATE POLICY "firm_templates_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'firm-templates' AND (
    app_private.has_role(auth.uid(),'batonnier')
    OR (storage.foldername(name))[1] = app_private.get_user_firm_id(auth.uid())::text));
CREATE POLICY "firm_templates_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'firm-templates' AND (
    app_private.has_role(auth.uid(),'batonnier')
    OR (storage.foldername(name))[1] = app_private.get_user_firm_id(auth.uid())::text));

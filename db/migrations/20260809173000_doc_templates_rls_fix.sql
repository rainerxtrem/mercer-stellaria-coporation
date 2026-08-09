-- Align document template RLS with enterprise module authorization and firm isolation.

-- Templates
DROP POLICY IF EXISTS tpl_select_firm ON public.doc_templates;
DROP POLICY IF EXISTS tpl_insert_manager ON public.doc_templates;
DROP POLICY IF EXISTS tpl_update_manager ON public.doc_templates;
DROP POLICY IF EXISTS tpl_delete_manager ON public.doc_templates;
DROP POLICY IF EXISTS tpl_insert_firm ON public.doc_templates;
DROP POLICY IF EXISTS tpl_update_firm ON public.doc_templates;
DROP POLICY IF EXISTS tpl_delete_firm ON public.doc_templates;

CREATE POLICY tpl_select_firm ON public.doc_templates
  FOR SELECT TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'));

CREATE POLICY tpl_insert_firm ON public.doc_templates
  FOR INSERT TO authenticated
  WITH CHECK (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'));

CREATE POLICY tpl_update_firm ON public.doc_templates
  FOR UPDATE TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'))
  WITH CHECK (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'));

CREATE POLICY tpl_delete_firm ON public.doc_templates
  FOR DELETE TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'));

-- Categories
DROP POLICY IF EXISTS tpl_cat_select_firm ON public.doc_template_categories;
DROP POLICY IF EXISTS tpl_cat_insert_manager ON public.doc_template_categories;
DROP POLICY IF EXISTS tpl_cat_update_manager ON public.doc_template_categories;
DROP POLICY IF EXISTS tpl_cat_delete_manager ON public.doc_template_categories;
DROP POLICY IF EXISTS tpl_cat_insert_firm ON public.doc_template_categories;
DROP POLICY IF EXISTS tpl_cat_update_firm ON public.doc_template_categories;
DROP POLICY IF EXISTS tpl_cat_delete_firm ON public.doc_template_categories;

CREATE POLICY tpl_cat_select_firm ON public.doc_template_categories
  FOR SELECT TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'));

CREATE POLICY tpl_cat_insert_firm ON public.doc_template_categories
  FOR INSERT TO authenticated
  WITH CHECK (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'));

CREATE POLICY tpl_cat_update_firm ON public.doc_template_categories
  FOR UPDATE TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'))
  WITH CHECK (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'));

CREATE POLICY tpl_cat_delete_firm ON public.doc_template_categories
  FOR DELETE TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'document_generator'));

-- Versions
DROP POLICY IF EXISTS tpl_ver_select_firm ON public.doc_template_versions;
DROP POLICY IF EXISTS tpl_ver_write_manager ON public.doc_template_versions;
DROP POLICY IF EXISTS tpl_ver_write_firm ON public.doc_template_versions;

CREATE POLICY tpl_ver_select_firm ON public.doc_template_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.doc_templates t
      WHERE t.id = template_id
        AND app_private.user_has_module(auth.uid(), t.firm_id, 'document_generator')
    )
  );

CREATE POLICY tpl_ver_write_firm ON public.doc_template_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.doc_templates t
      WHERE t.id = template_id
        AND app_private.user_has_module(auth.uid(), t.firm_id, 'document_generator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.doc_templates t
      WHERE t.id = template_id
        AND app_private.user_has_module(auth.uid(), t.firm_id, 'document_generator')
    )
  );

-- Storage bucket policies for templates
DROP POLICY IF EXISTS firm_templates_manager_all ON storage.objects;
DROP POLICY IF EXISTS firm_templates_read ON storage.objects;
DROP POLICY IF EXISTS firm_templates_write ON storage.objects;
DROP POLICY IF EXISTS firm_templates_update ON storage.objects;
DROP POLICY IF EXISTS firm_templates_delete ON storage.objects;

CREATE POLICY firm_templates_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'firm-templates'
    AND CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN app_private.user_has_module(auth.uid(), ((storage.foldername(name))[1])::uuid, 'document_generator')
      ELSE false
    END
  );

CREATE POLICY firm_templates_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'firm-templates'
    AND CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN app_private.user_has_module(auth.uid(), ((storage.foldername(name))[1])::uuid, 'document_generator')
      ELSE false
    END
  );

CREATE POLICY firm_templates_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'firm-templates'
    AND CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN app_private.user_has_module(auth.uid(), ((storage.foldername(name))[1])::uuid, 'document_generator')
      ELSE false
    END
  )
  WITH CHECK (
    bucket_id = 'firm-templates'
    AND CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN app_private.user_has_module(auth.uid(), ((storage.foldername(name))[1])::uuid, 'document_generator')
      ELSE false
    END
  );

CREATE POLICY firm_templates_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'firm-templates'
    AND CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN app_private.user_has_module(auth.uid(), ((storage.foldername(name))[1])::uuid, 'document_generator')
      ELSE false
    END
  );

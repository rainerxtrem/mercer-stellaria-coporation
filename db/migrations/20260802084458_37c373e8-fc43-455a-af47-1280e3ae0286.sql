CREATE POLICY "firm_templates_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'firm-templates'
    AND (
      app_private.has_role(auth.uid(), 'batonnier')
      OR (storage.foldername(name))[1] = app_private.get_user_firm_id(auth.uid())::text
    )
  );

CREATE POLICY "firm_templates_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'firm-templates'
    AND (
      app_private.has_role(auth.uid(), 'batonnier')
      OR (app_private.has_role(auth.uid(), 'responsable_cabinet')
          AND (storage.foldername(name))[1] = app_private.get_user_firm_id(auth.uid())::text)
    )
  );

CREATE POLICY "firm_templates_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'firm-templates'
    AND (
      app_private.has_role(auth.uid(), 'batonnier')
      OR (app_private.has_role(auth.uid(), 'responsable_cabinet')
          AND (storage.foldername(name))[1] = app_private.get_user_firm_id(auth.uid())::text)
    )
  );

CREATE POLICY "firm_templates_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'firm-templates'
    AND (
      app_private.has_role(auth.uid(), 'batonnier')
      OR (app_private.has_role(auth.uid(), 'responsable_cabinet')
          AND (storage.foldername(name))[1] = app_private.get_user_firm_id(auth.uid())::text)
    )
  );
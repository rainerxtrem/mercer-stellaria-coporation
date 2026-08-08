
DROP POLICY IF EXISTS "bar_library_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "bar_library_batonnier_write" ON storage.objects;

CREATE POLICY "bar_library_authenticated_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'bar-library');

CREATE POLICY "bar_library_batonnier_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'bar-library' AND public.has_role(auth.uid(), 'batonnier'))
  WITH CHECK (bucket_id = 'bar-library' AND public.has_role(auth.uid(), 'batonnier'));

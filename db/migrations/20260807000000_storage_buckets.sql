-- =============================================================================
-- Storage buckets used by the application.
-- All private: access is granted exclusively through the storage RLS policies
-- defined in the earlier migrations, plus short-lived signed URLs.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('bar-media',      'bar-media',      false, 26214400),
  ('bar-library',    'bar-library',    false, 26214400),
  ('firm-templates', 'firm-templates', false, 26214400)
ON CONFLICT (id) DO NOTHING;


ALTER TABLE public.library_articles
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint;

CREATE INDEX IF NOT EXISTS library_categories_parent_idx ON public.library_categories(parent_id);
CREATE INDEX IF NOT EXISTS library_articles_category_idx ON public.library_articles(category_id);
CREATE INDEX IF NOT EXISTS library_articles_tags_idx ON public.library_articles USING gin(tags);

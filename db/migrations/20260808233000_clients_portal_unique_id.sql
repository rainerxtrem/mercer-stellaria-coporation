-- Client-defined portal unique identifier used during Discord onboarding.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_unique_id text;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_portal_unique_id_format;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_portal_unique_id_format
  CHECK (
    portal_unique_id IS NULL
    OR (
      btrim(portal_unique_id) <> ''
      AND length(portal_unique_id) BETWEEN 3 AND 64
      AND portal_unique_id ~ '^[A-Za-z0-9_-]+$'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS clients_portal_unique_id_key
  ON public.clients (upper(portal_unique_id))
  WHERE portal_unique_id IS NOT NULL;

-- Allow 1-character client-defined portal unique IDs.

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_portal_unique_id_format;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_portal_unique_id_format
  CHECK (
    portal_unique_id IS NULL
    OR (
      btrim(portal_unique_id) <> ''
      AND length(portal_unique_id) BETWEEN 1 AND 64
      AND portal_unique_id ~ '^[A-Za-z0-9_-]+$'
    )
  );

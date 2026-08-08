-- =============================================================================
-- 00000000000000_bootstrap_auth_storage
-- -----------------------------------------------------------------------------
-- Provides, on a plain PostgreSQL server, the primitives the application schema
-- depends on: the anon / authenticated / service_role roles, the `auth` schema
-- (users + JWT claim accessors used by 380+ RLS policies) and the `storage`
-- schema (buckets/objects + path helpers used by the storage RLS policies).
--
-- Runs before every domain migration. Idempotent.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- The application connects as a single database user and switches role per
-- request (SET LOCAL ROLE), so that user must be a member of each role.
DO $$
BEGIN
  EXECUTE format('GRANT anon, authenticated, service_role TO %I', current_user);
EXCEPTION WHEN insufficient_privilege OR duplicate_object THEN
  NULL;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  invited_at          timestamptz,
  confirmation_sent_at timestamptz,
  recovery_sent_at    timestamptz,
  last_sign_in_at     timestamptz,
  raw_app_meta_data   jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_user_meta_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_super_admin      boolean NOT NULL DEFAULT false,
  banned_until        timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON auth.users (lower(email)) WHERE email IS NOT NULL;

-- Refresh tokens: only the hash is stored, never the token itself.
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  parent_id   uuid REFERENCES auth.refresh_tokens(id) ON DELETE SET NULL,
  revoked_at  timestamptz,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON auth.refresh_tokens (user_id);

-- Single-use tokens backing invitations, email confirmation and password reset.
CREATE TABLE IF NOT EXISTS auth.one_time_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_type text NOT NULL CHECK (token_type IN ('confirmation', 'recovery', 'invite', 'email_change')),
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS one_time_tokens_user_id_idx ON auth.one_time_tokens (user_id);

-- JWT claims are injected per transaction by the application
-- (SET LOCAL request.jwt.claims = '<json>').
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(auth.jwt() ->> 'role', ''), 'anon');
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'email', '');
$$;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role(), auth.email()
  TO anon, authenticated, service_role;

-- auth.users is never exposed through the data API; it is reached only by the
-- server-side auth service running as the table owner.
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- storage schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  public             boolean NOT NULL DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id        text NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name             text NOT NULL,
  owner            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  path_tokens      text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT objects_bucket_name_key UNIQUE (bucket_id, name)
);
CREATE INDEX IF NOT EXISTS objects_bucket_prefix_idx ON storage.objects (bucket_id, name text_pattern_ops);

-- Path helpers mirroring the Supabase storage API used by the RLS policies:
-- foldername() returns every path segment except the file name.
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN array_length(parts, 1) IS NULL OR array_length(parts, 1) < 2 THEN ARRAY[]::text[]
    ELSE parts[1:array_length(parts, 1) - 1]
  END
  FROM (SELECT string_to_array(name, '/') AS parts) s;
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT parts[array_length(parts, 1)]
  FROM (SELECT string_to_array(name, '/') AS parts) s;
$$;

CREATE OR REPLACE FUNCTION storage.extension(name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN array_length(parts, 1) IS NULL OR array_length(parts, 1) < 2 THEN ''
    ELSE parts[array_length(parts, 1)]
  END
  FROM (SELECT string_to_array(storage.filename(name), '.') AS parts) s;
$$;

GRANT EXECUTE ON FUNCTION storage.foldername(text), storage.filename(text), storage.extension(text)
  TO anon, authenticated, service_role;

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT ALL ON storage.buckets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
GRANT ALL ON storage.objects TO service_role;

DROP POLICY IF EXISTS buckets_read ON storage.buckets;
CREATE POLICY buckets_read ON storage.buckets FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION storage.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS objects_updated_at ON storage.objects;
CREATE TRIGGER objects_updated_at BEFORE UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION storage.touch_updated_at();

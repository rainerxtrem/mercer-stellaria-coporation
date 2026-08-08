
-- Revoke broad table-level privileges from authenticated to enforce column-level access
REVOKE ALL ON public.lawyers FROM authenticated;

-- Grant only directory-safe columns for reading to authenticated users (matches anon)
GRANT SELECT (id, license, first_name, last_name, photo_url, firm_id, specialty, city, status, admitted_on, bio, profile_id, created_at, updated_at) ON public.lawyers TO authenticated;

-- Keep write privileges for authenticated (still gated by RLS policies)
GRANT INSERT, UPDATE, DELETE ON public.lawyers TO authenticated;

-- service_role keeps full access (already default via role membership, ensure explicit)
GRANT ALL ON public.lawyers TO service_role;

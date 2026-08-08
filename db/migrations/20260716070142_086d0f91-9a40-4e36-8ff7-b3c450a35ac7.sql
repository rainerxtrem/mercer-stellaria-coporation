
-- matters_set_number is a trigger function only; no one needs to call it directly.
ALTER FUNCTION public.matters_set_number() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.matters_set_number() FROM PUBLIC, anon, authenticated;

-- can_access_matter must remain SECURITY DEFINER (used in RLS + Storage policies)
-- but only authenticated users need to call it.
REVOKE EXECUTE ON FUNCTION public.can_access_matter(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_matter(UUID) TO authenticated;

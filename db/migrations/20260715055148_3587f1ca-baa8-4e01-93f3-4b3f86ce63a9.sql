REVOKE EXECUTE ON FUNCTION public.admin_list_lawyers() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.lawyers_guard_self_update() FROM anon, authenticated, public;
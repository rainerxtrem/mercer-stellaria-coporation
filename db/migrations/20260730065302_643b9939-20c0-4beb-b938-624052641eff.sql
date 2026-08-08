DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR app_private.has_role(auth.uid(), 'batonnier')
    OR app_private.users_share_firm(auth.uid(), id)
  );
GRANT EXECUTE ON FUNCTION app_private.users_share_firm(uuid, uuid) TO authenticated;
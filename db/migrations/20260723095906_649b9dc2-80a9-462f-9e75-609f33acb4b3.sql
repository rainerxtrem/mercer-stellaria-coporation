
-- 1. Étendre l'enum de rôles (cumulables)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'responsable_cabinet';

-- 2. public.has_role : héritage batonnier -> avocat/assistant/responsable_cabinet/citoyen
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
  OR (
    _role <> 'batonnier'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'batonnier'
    )
  );
$$;

-- 3. app_private.has_role délègue à public.has_role (mêmes règles d'héritage)
CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, _role);
$$;

-- 4. Accorder EXECUTE aux utilisateurs authentifiés (nécessaire pour rpc('has_role'))
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, app_role) TO authenticated;

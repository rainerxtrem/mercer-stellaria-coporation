
-- 1) bar_exam_answers: retirer l'accès direct des candidats
DROP POLICY IF EXISTS bar_answers_candidate_read ON public.bar_exam_answers;

-- 2) training_choices: masquer is_correct au niveau colonne
REVOKE SELECT (is_correct) ON public.training_choices FROM anon, authenticated, PUBLIC;

-- 3) has_role public en SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- 4) Remplacer les policies matter_tasks qui utilisent public.can_access_matter
--    par app_private.can_access_matter, puis supprimer la fonction publique
DROP POLICY IF EXISTS matter_tasks_read ON public.matter_tasks;
DROP POLICY IF EXISTS matter_tasks_insert ON public.matter_tasks;

CREATE POLICY matter_tasks_read ON public.matter_tasks
  FOR SELECT
  USING (app_private.can_access_matter(matter_id));

CREATE POLICY matter_tasks_insert ON public.matter_tasks
  FOR INSERT
  WITH CHECK (app_private.can_access_matter(matter_id) AND (created_by = auth.uid()));

DROP FUNCTION IF EXISTS public.can_access_matter(uuid);

-- 5) Révoquer EXECUTE anon/authenticated sur les fonctions definer non exposées côté client
REVOKE EXECUTE ON FUNCTION public.get_public_lawyer(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_stats() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_disciplinary_decisions() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_firm_id() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_firm_stats(uuid) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_lawyer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_disciplinary_decisions() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_firm_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_firm_stats(uuid) TO service_role;

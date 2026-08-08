
-- 1. Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'formateur';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'examinateur';

-- 2. Allow Bâtonnier to insert/delete user_roles (existing policies only permit self-read)
DROP POLICY IF EXISTS "batonnier_manage_user_roles_insert" ON public.user_roles;
CREATE POLICY "batonnier_manage_user_roles_insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'batonnier'));

DROP POLICY IF EXISTS "batonnier_manage_user_roles_delete" ON public.user_roles;
CREATE POLICY "batonnier_manage_user_roles_delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'batonnier'));

DROP POLICY IF EXISTS "batonnier_read_all_user_roles" ON public.user_roles;
CREATE POLICY "batonnier_read_all_user_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'batonnier') OR user_id = auth.uid());

-- 3. Audit trigger on user_roles
DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row();

-- 4. Allow directeur de cabinet (responsable_cabinet) to update their own firm's name/logo
DROP POLICY IF EXISTS "cabinet_manager_update_own_firm" ON public.firms;
CREATE POLICY "cabinet_manager_update_own_firm" ON public.firms
  FOR UPDATE TO authenticated
  USING (id = public.get_my_firm_id() AND public.has_role(auth.uid(), 'responsable_cabinet'))
  WITH CHECK (id = public.get_my_firm_id() AND public.has_role(auth.uid(), 'responsable_cabinet'));

-- 5. Allow directeur to suspend/reactivate lawyers in their own firm (status only; the
-- lawyers_guard_self_update trigger already gates other regulated fields to the Bâtonnier).
-- We add a permissive UPDATE policy scoped to the firm; the trigger will block any change
-- other than `status` for a non-Bâtonnier caller.
DROP POLICY IF EXISTS "cabinet_manager_update_firm_lawyers" ON public.lawyers;
CREATE POLICY "cabinet_manager_update_firm_lawyers" ON public.lawyers
  FOR UPDATE TO authenticated
  USING (firm_id = public.get_my_firm_id() AND public.has_role(auth.uid(), 'responsable_cabinet'))
  WITH CHECK (firm_id = public.get_my_firm_id() AND public.has_role(auth.uid(), 'responsable_cabinet'));

-- Allow the trigger to accept a status change coming from a directeur on their own firm's lawyers.
CREATE OR REPLACE FUNCTION public.lawyers_guard_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF app_private.has_role(auth.uid(), 'batonnier') THEN
    RETURN NEW;
  END IF;

  -- Directeur de cabinet: only allowed to change `status` on a lawyer of their own firm.
  IF app_private.has_role(auth.uid(), 'responsable_cabinet')
     AND OLD.firm_id IS NOT NULL
     AND OLD.firm_id = public.get_my_firm_id() THEN
    IF NEW.license IS DISTINCT FROM OLD.license
       OR NEW.admitted_on IS DISTINCT FROM OLD.admitted_on
       OR NEW.firm_id IS DISTINCT FROM OLD.firm_id
       OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
       OR NEW.first_name IS DISTINCT FROM OLD.first_name
       OR NEW.last_name IS DISTINCT FROM OLD.last_name THEN
      RAISE EXCEPTION 'Le directeur de cabinet ne peut modifier que le statut.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.license IS DISTINCT FROM OLD.license
     OR NEW.admitted_on IS DISTINCT FROM OLD.admitted_on
     OR NEW.firm_id IS DISTINCT FROM OLD.firm_id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    RAISE EXCEPTION 'Only the Bâtonnier can modify regulated fields (status, license, admitted_on, firm, name).';
  END IF;
  RETURN NEW;
END;
$function$;

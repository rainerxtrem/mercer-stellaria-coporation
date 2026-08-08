-- 1. Traçabilité: dernière modification par
ALTER TABLE public.matters  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.clients  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.set_updated_by()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_updated_by() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS matters_set_updated_by ON public.matters;
CREATE TRIGGER matters_set_updated_by BEFORE INSERT OR UPDATE ON public.matters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();
DROP TRIGGER IF EXISTS clients_set_updated_by ON public.clients;
CREATE TRIGGER clients_set_updated_by BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();
DROP TRIGGER IF EXISTS invoices_set_updated_by ON public.invoices;
CREATE TRIGGER invoices_set_updated_by BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();

-- 2. Helper central: accès basé sur le cabinet (firm_id) du propriétaire
CREATE OR REPLACE FUNCTION app_private.can_access_owned(_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _owner_id = auth.uid()
      OR app_private.has_role(auth.uid(), 'batonnier')
      OR app_private.users_share_firm(auth.uid(), _owner_id);
$$;
REVOKE ALL ON FUNCTION app_private.can_access_owned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_owned(uuid) TO authenticated;

-- Suppression: créateur, directeur du même cabinet, ou bâtonnier
CREATE OR REPLACE FUNCTION app_private.can_delete_owned(_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _owner_id = auth.uid()
      OR app_private.has_role(auth.uid(), 'batonnier')
      OR (app_private.has_role(auth.uid(), 'responsable_cabinet')
          AND app_private.users_share_firm(auth.uid(), _owner_id));
$$;
REVOKE ALL ON FUNCTION app_private.can_delete_owned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_delete_owned(uuid) TO authenticated;

-- 3. Accès dossier: propriétaire, membre du cabinet, assistant, bâtonnier
CREATE OR REPLACE FUNCTION app_private.can_access_matter(_matter_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matters m
    WHERE m.id = _matter_id
      AND (
        app_private.can_access_owned(m.owner_id)
        OR EXISTS (SELECT 1 FROM public.matter_assistants a
                   WHERE a.matter_id = _matter_id AND a.user_id = auth.uid())
      )
  );
$$;

-- 4. Politiques MATTERS
DROP POLICY IF EXISTS matters_select ON public.matters;
DROP POLICY IF EXISTS matters_insert ON public.matters;
DROP POLICY IF EXISTS matters_update ON public.matters;
DROP POLICY IF EXISTS matters_delete ON public.matters;

CREATE POLICY matters_select ON public.matters FOR SELECT TO authenticated
  USING (app_private.can_access_owned(owner_id) OR app_private.is_matter_assistant(id, auth.uid()));
CREATE POLICY matters_insert ON public.matters FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY matters_update ON public.matters FOR UPDATE TO authenticated
  USING (app_private.can_access_owned(owner_id) OR app_private.is_matter_assistant(id, auth.uid()))
  WITH CHECK (app_private.can_access_owned(owner_id) OR app_private.is_matter_assistant(id, auth.uid()));
CREATE POLICY matters_delete ON public.matters FOR DELETE TO authenticated
  USING (app_private.can_delete_owned(owner_id));

-- 5. Politiques CLIENTS
DROP POLICY IF EXISTS clients_owner_all ON public.clients;
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated
  USING (app_private.can_access_owned(owner_id));
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated
  USING (app_private.can_access_owned(owner_id))
  WITH CHECK (app_private.can_access_owned(owner_id));
CREATE POLICY clients_delete ON public.clients FOR DELETE TO authenticated
  USING (app_private.can_delete_owned(owner_id));

-- 6. Politiques INVOICES (devis + factures)
DROP POLICY IF EXISTS invoices_owner_all ON public.invoices;
CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
  USING (app_private.can_access_owned(owner_id));
CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY invoices_update ON public.invoices FOR UPDATE TO authenticated
  USING (app_private.can_access_owned(owner_id))
  WITH CHECK (app_private.can_access_owned(owner_id));
CREATE POLICY invoices_delete ON public.invoices FOR DELETE TO authenticated
  USING (app_private.can_delete_owned(owner_id));

-- 7. Lignes et paiements suivent la facture
CREATE OR REPLACE FUNCTION app_private.can_access_invoice(_invoice_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = _invoice_id AND app_private.can_access_owned(i.owner_id)
  );
$$;
REVOKE ALL ON FUNCTION app_private.can_access_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_invoice(uuid) TO authenticated;

DROP POLICY IF EXISTS invoice_items_owner_all ON public.invoice_items;
CREATE POLICY invoice_items_access ON public.invoice_items FOR ALL TO authenticated
  USING (app_private.can_access_invoice(invoice_id))
  WITH CHECK (app_private.can_access_invoice(invoice_id));

DROP POLICY IF EXISTS invoice_payments_owner_all ON public.invoice_payments;
CREATE POLICY invoice_payments_access ON public.invoice_payments FOR ALL TO authenticated
  USING (app_private.can_access_invoice(invoice_id))
  WITH CHECK (app_private.can_access_invoice(invoice_id));

-- 8. Tâches: tout membre du cabinet peut mettre à jour; suppression au créateur/directeur/bâtonnier
DROP POLICY IF EXISTS matter_tasks_update ON public.matter_tasks;
DROP POLICY IF EXISTS matter_tasks_delete ON public.matter_tasks;
CREATE POLICY matter_tasks_update ON public.matter_tasks FOR UPDATE TO authenticated
  USING (app_private.can_access_matter(matter_id))
  WITH CHECK (app_private.can_access_matter(matter_id));
CREATE POLICY matter_tasks_delete ON public.matter_tasks FOR DELETE TO authenticated
  USING (created_by = auth.uid()
         OR app_private.is_matter_owner(matter_id, auth.uid())
         OR app_private.has_role(auth.uid(), 'responsable_cabinet')
         OR app_private.has_role(auth.uid(), 'batonnier'));
-- 1) Signature tables: scope access to the invoice owner / firm colleagues
DROP POLICY IF EXISTS signature_links_select ON public.signature_links;
DROP POLICY IF EXISTS signature_links_insert ON public.signature_links;
DROP POLICY IF EXISTS signature_links_update ON public.signature_links;
DROP POLICY IF EXISTS signature_links_delete ON public.signature_links;
DROP POLICY IF EXISTS document_signatures_select ON public.document_signatures;
DROP POLICY IF EXISTS signature_events_select ON public.signature_events;

CREATE POLICY signature_links_select ON public.signature_links
  FOR SELECT TO authenticated
  USING (app_private.can_access_invoice(invoice_id));

CREATE POLICY signature_links_insert ON public.signature_links
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND app_private.can_access_invoice(invoice_id));

CREATE POLICY signature_links_update ON public.signature_links
  FOR UPDATE TO authenticated
  USING (app_private.can_access_invoice(invoice_id))
  WITH CHECK (app_private.can_access_invoice(invoice_id));

CREATE POLICY signature_links_delete ON public.signature_links
  FOR DELETE TO authenticated
  USING (app_private.can_access_invoice(invoice_id));

CREATE POLICY document_signatures_select ON public.document_signatures
  FOR SELECT TO authenticated
  USING (app_private.can_access_invoice(invoice_id));

CREATE POLICY signature_events_select ON public.signature_events
  FOR SELECT TO authenticated
  USING (app_private.can_access_invoice(invoice_id));

-- 2) Lawyers: anonymous visitors get directory columns only (no email/phone/address/bio)
REVOKE SELECT ON public.lawyers FROM anon;
GRANT SELECT (
  id, license, first_name, last_name, photo_url, specialty,
  city, status, admitted_on, firm_id, created_at, updated_at
) ON public.lawyers TO anon;

-- 3) Lawyers cannot self-edit regulated fields: no self-update policy at all
DROP POLICY IF EXISTS lawyers_update_own ON public.lawyers;
DROP POLICY IF EXISTS lawyers_self_update ON public.lawyers;
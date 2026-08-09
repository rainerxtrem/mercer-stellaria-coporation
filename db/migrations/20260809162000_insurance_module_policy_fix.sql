-- Tighten insert policies for insurance modules so client ownership is verified.

DROP POLICY IF EXISTS insurance_claims_insert ON public.insurance_claims;
CREATE POLICY insurance_claims_insert ON public.insurance_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.can_access_client_module_record(auth.uid(), firm_id, client_id, 'claims')
  );

DROP POLICY IF EXISTS refund_requests_insert ON public.refund_requests;
CREATE POLICY refund_requests_insert ON public.refund_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.can_access_client_module_record(auth.uid(), firm_id, client_id, 'refunds')
  );

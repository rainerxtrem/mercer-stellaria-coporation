-- Avoid recursive self-checks in SELECT policies for insurance request rows.

DROP POLICY IF EXISTS insurance_claims_select ON public.insurance_claims;
CREATE POLICY insurance_claims_select ON public.insurance_claims
  FOR SELECT TO authenticated
  USING (
    app_private.can_access_firm_module(auth.uid(), firm_id, 'claims')
    AND (
      app_private.user_has_module(auth.uid(), firm_id, 'claims')
      OR EXISTS (
        SELECT 1
        FROM public.clients client
        WHERE client.id = client_id
          AND client.profile_id = auth.uid()
          AND client.firm_id = firm_id
      )
    )
  );

DROP POLICY IF EXISTS refund_requests_select ON public.refund_requests;
CREATE POLICY refund_requests_select ON public.refund_requests
  FOR SELECT TO authenticated
  USING (
    app_private.can_access_firm_module(auth.uid(), firm_id, 'refunds')
    AND (
      app_private.user_has_module(auth.uid(), firm_id, 'refunds')
      OR EXISTS (
        SELECT 1
        FROM public.clients client
        WHERE client.id = client_id
          AND client.profile_id = auth.uid()
          AND client.firm_id = firm_id
      )
    )
  );

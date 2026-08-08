
DROP POLICY IF EXISTS "invoices_public_verify" ON public.invoices;
REVOKE SELECT ON public.invoices FROM anon;

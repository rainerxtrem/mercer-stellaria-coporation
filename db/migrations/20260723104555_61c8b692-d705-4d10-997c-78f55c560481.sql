
-- Helper: retourne le firm_id du responsable_cabinet connecté (via lawyers.profile_id)
CREATE OR REPLACE FUNCTION public.get_my_firm_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_id
  FROM public.lawyers
  WHERE profile_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_firm_id() TO authenticated;

-- Statistiques agrégées pour le portail cabinet
CREATE OR REPLACE FUNCTION public.get_firm_stats(_firm_id uuid)
RETURNS TABLE(
  members_total bigint,
  members_active bigint,
  matters_total bigint,
  matters_open bigint,
  invoices_total bigint,
  revenue_paid numeric,
  revenue_pending numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH member_profiles AS (
    SELECT profile_id FROM public.lawyers WHERE firm_id = _firm_id AND profile_id IS NOT NULL
  )
  SELECT
    (SELECT count(*) FROM public.lawyers WHERE firm_id = _firm_id),
    (SELECT count(*) FROM public.lawyers WHERE firm_id = _firm_id AND status = 'active'),
    (SELECT count(*) FROM public.matters WHERE owner_id IN (SELECT profile_id FROM member_profiles)),
    (SELECT count(*) FROM public.matters WHERE owner_id IN (SELECT profile_id FROM member_profiles) AND status <> 'closed'),
    (SELECT count(*) FROM public.invoices WHERE owner_id IN (SELECT profile_id FROM member_profiles) AND kind = 'invoice'),
    (SELECT COALESCE(SUM(paid_amount), 0) FROM public.invoices WHERE owner_id IN (SELECT profile_id FROM member_profiles) AND kind = 'invoice'),
    (SELECT COALESCE(SUM(total - paid_amount), 0) FROM public.invoices WHERE owner_id IN (SELECT profile_id FROM member_profiles) AND kind = 'invoice' AND status <> 'paid');
$$;

GRANT EXECUTE ON FUNCTION public.get_firm_stats(uuid) TO authenticated;


-- Restrict anonymous exposure of lawyer PII: split read policy by role and revoke sensitive columns from anon
DROP POLICY IF EXISTS lawyers_public_read ON public.lawyers;
CREATE POLICY lawyers_anon_read ON public.lawyers FOR SELECT TO anon USING (true);
CREATE POLICY lawyers_auth_read ON public.lawyers FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.lawyers FROM anon;
GRANT SELECT (id, profile_id, license, first_name, last_name, photo_url, firm_id, specialty, city, status, admitted_on, created_at, updated_at)
  ON public.lawyers TO anon;
-- email, phone, address, bio remain readable only by authenticated users and via the batonnier admin RPC

-- Revoke EXECUTE from public/anon/authenticated on SECURITY DEFINER functions that don't need to be callable
REVOKE ALL ON FUNCTION public.invoices_set_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoices_set_number() FROM anon;
REVOKE ALL ON FUNCTION public.invoices_set_number() FROM authenticated;

REVOKE ALL ON FUNCTION public.disciplinary_cases_set_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_cases_set_number() FROM anon;
REVOKE ALL ON FUNCTION public.disciplinary_cases_set_number() FROM authenticated;

REVOKE ALL ON FUNCTION public.matters_set_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.matters_set_number() FROM anon;
REVOKE ALL ON FUNCTION public.matters_set_number() FROM authenticated;

REVOKE ALL ON FUNCTION public.admin_list_lawyers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_lawyers() FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_lawyers() FROM authenticated;

REVOKE ALL ON FUNCTION public.bar_exam_recompute_total(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bar_exam_recompute_total(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.bar_exam_recompute_total(uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.next_bar_license() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_bar_license() FROM anon;
REVOKE ALL ON FUNCTION public.next_bar_license() FROM authenticated;

REVOKE ALL ON FUNCTION public.audit_log_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_log_row() FROM anon;
REVOKE ALL ON FUNCTION public.audit_log_row() FROM authenticated;

REVOKE ALL ON FUNCTION public.disciplinary_apply_sanction() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disciplinary_apply_sanction() FROM anon;
REVOKE ALL ON FUNCTION public.disciplinary_apply_sanction() FROM authenticated;

REVOKE ALL ON FUNCTION public.notify_batonnier_new_complaint() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_batonnier_new_complaint() FROM anon;
REVOKE ALL ON FUNCTION public.notify_batonnier_new_complaint() FROM authenticated;

REVOKE ALL ON FUNCTION public.notify_batonnier_new_contact() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_batonnier_new_contact() FROM anon;
REVOKE ALL ON FUNCTION public.notify_batonnier_new_contact() FROM authenticated;

REVOKE ALL ON FUNCTION public.notify_matter_assistant_added() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_matter_assistant_added() FROM anon;
REVOKE ALL ON FUNCTION public.notify_matter_assistant_added() FROM authenticated;

REVOKE ALL ON FUNCTION public.lawyers_guard_self_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lawyers_guard_self_update() FROM anon;
REVOKE ALL ON FUNCTION public.lawyers_guard_self_update() FROM authenticated;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

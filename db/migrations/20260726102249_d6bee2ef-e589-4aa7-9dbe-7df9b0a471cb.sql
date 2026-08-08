
-- Restrict anonymous access to lawyers PII: column-level grants on directory-safe fields only
REVOKE ALL ON public.lawyers FROM anon;
GRANT SELECT (id, license, first_name, last_name, photo_url, specialty, city, status, admitted_on, firm_id, bio) ON public.lawyers TO anon;

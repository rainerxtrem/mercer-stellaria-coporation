
DROP POLICY IF EXISTS "bar_exams_open_read" ON public.bar_exams;

CREATE OR REPLACE FUNCTION public.list_open_bar_exams()
RETURNS TABLE(
  id uuid, name text, description text, duration_min int,
  opens_at timestamptz, closes_at timestamptz, pass_threshold_pct int,
  total_points numeric, max_attempts int, show_results_to_candidate boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, description, duration_min, opens_at, closes_at,
         pass_threshold_pct, total_points, max_attempts, show_results_to_candidate
  FROM public.bar_exams
  WHERE status = 'open'
    AND (opens_at IS NULL OR opens_at <= now())
    AND (closes_at IS NULL OR closes_at >= now())
  ORDER BY opens_at NULLS LAST, created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.list_open_bar_exams() TO authenticated;

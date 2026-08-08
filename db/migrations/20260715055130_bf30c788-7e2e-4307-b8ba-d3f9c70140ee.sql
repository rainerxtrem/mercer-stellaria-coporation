CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email))
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'citoyen')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;
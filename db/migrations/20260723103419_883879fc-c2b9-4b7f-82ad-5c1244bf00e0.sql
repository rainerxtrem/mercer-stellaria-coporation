
CREATE OR REPLACE FUNCTION public.notify_batonnier_new_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b RECORD;
BEGIN
  FOR b IN SELECT user_id FROM public.user_roles WHERE role = 'batonnier' LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (
      b.user_id,
      'contact_request',
      'Nouvelle demande de contact',
      NEW.first_name || ' ' || NEW.last_name || ' — ' || NEW.subject,
      '/admin/demandes',
      'contact_request',
      NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

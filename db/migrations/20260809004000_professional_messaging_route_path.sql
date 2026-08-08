UPDATE public.enterprise_module_catalog
SET route_path = '/messagerie-professionnelle',
    updated_at = now()
WHERE slug = 'messaging';

DELETE FROM public.enterprise_module_targets
WHERE module_slug = 'messaging'
  AND target_kind = 'route'
  AND target_name = '/messagerie';

INSERT INTO public.enterprise_module_targets (module_slug, target_kind, target_name)
VALUES ('messaging', 'route', '/messagerie-professionnelle')
ON CONFLICT DO NOTHING;
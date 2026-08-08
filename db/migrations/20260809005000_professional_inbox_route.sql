UPDATE public.enterprise_module_catalog
SET route_path = '/dossiers?messagerie=1',
    updated_at = now()
WHERE slug = 'messaging';

DELETE FROM public.enterprise_module_targets
WHERE module_slug = 'messaging'
  AND target_kind = 'route'
  AND target_name IN ('/messagerie', '/messagerie-professionnelle');

INSERT INTO public.enterprise_module_targets (module_slug, target_kind, target_name)
VALUES ('messaging', 'route', '/dossiers?messagerie=1')
ON CONFLICT DO NOTHING;
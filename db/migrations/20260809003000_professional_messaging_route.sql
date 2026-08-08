UPDATE public.enterprise_module_catalog
SET route_path = '/messagerie',
    label = 'Messagerie',
    description = 'Conversations clients et communication autour des dossiers',
    icon_name = 'MessageSquare',
    updated_at = now()
WHERE slug = 'messaging';

DELETE FROM public.enterprise_module_targets
WHERE module_slug = 'messaging'
  AND target_kind = 'route'
  AND target_name = '/dossiers';

INSERT INTO public.enterprise_module_targets (module_slug, target_kind, target_name)
VALUES ('messaging', 'route', '/messagerie')
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS client_conversations_staff_all ON public.client_conversations;
CREATE POLICY client_conversations_staff_all ON public.client_conversations FOR ALL TO authenticated
  USING (app_private.user_has_module(auth.uid(), firm_id, 'messaging'))
  WITH CHECK (app_private.user_has_module(auth.uid(), firm_id, 'messaging'));

DROP POLICY IF EXISTS client_conv_messages_staff_all ON public.client_conversation_messages;
CREATE POLICY client_conv_messages_staff_all ON public.client_conversation_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_conversations conversation
      WHERE conversation.id = conversation_id
        AND app_private.user_has_module(auth.uid(), conversation.firm_id, 'messaging')
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.client_conversations conversation
      WHERE conversation.id = conversation_id
        AND app_private.user_has_module(auth.uid(), conversation.firm_id, 'messaging')
    )
  );

-- Security definer helper: bypasses RLS to avoid recursion between matters <-> matter_assistants
CREATE OR REPLACE FUNCTION app_private.is_matter_assistant(_matter_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matter_assistants
    WHERE matter_id = _matter_id AND user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_matter_assistant(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.is_matter_owner(_matter_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matters WHERE id = _matter_id AND owner_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_matter_owner(uuid, uuid) FROM PUBLIC;

-- Rebuild matters policies without cross-table subqueries that trigger recursion
DROP POLICY IF EXISTS matters_assistant_read ON public.matters;
DROP POLICY IF EXISTS matters_owner_manage ON public.matters;

CREATE POLICY matters_select ON public.matters
FOR SELECT
USING (
  owner_id = auth.uid()
  OR app_private.has_role(auth.uid(), 'batonnier'::app_role)
  OR app_private.is_matter_assistant(id, auth.uid())
);

CREATE POLICY matters_insert ON public.matters
FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY matters_update ON public.matters
FOR UPDATE
USING (owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'::app_role))
WITH CHECK (owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'::app_role));

CREATE POLICY matters_delete ON public.matters
FOR DELETE
USING (owner_id = auth.uid() OR app_private.has_role(auth.uid(), 'batonnier'::app_role));

-- Rebuild matter_assistants policies to avoid subquery on matters
DROP POLICY IF EXISTS matter_assistants_owner_manage ON public.matter_assistants;
DROP POLICY IF EXISTS matter_assistants_self_read ON public.matter_assistants;

CREATE POLICY matter_assistants_select ON public.matter_assistants
FOR SELECT
USING (
  user_id = auth.uid()
  OR app_private.is_matter_owner(matter_id, auth.uid())
  OR app_private.has_role(auth.uid(), 'batonnier'::app_role)
);

CREATE POLICY matter_assistants_write ON public.matter_assistants
FOR ALL
USING (
  app_private.is_matter_owner(matter_id, auth.uid())
  OR app_private.has_role(auth.uid(), 'batonnier'::app_role)
)
WITH CHECK (
  app_private.is_matter_owner(matter_id, auth.uid())
  OR app_private.has_role(auth.uid(), 'batonnier'::app_role)
);

-- matter_tasks: replace subqueries on matters with helper function
DROP POLICY IF EXISTS matter_tasks_delete ON public.matter_tasks;
DROP POLICY IF EXISTS matter_tasks_update ON public.matter_tasks;

CREATE POLICY matter_tasks_delete ON public.matter_tasks
FOR DELETE
USING (
  created_by = auth.uid()
  OR app_private.is_matter_owner(matter_id, auth.uid())
  OR app_private.has_role(auth.uid(), 'batonnier'::app_role)
);

CREATE POLICY matter_tasks_update ON public.matter_tasks
FOR UPDATE
USING (
  app_private.can_access_matter(matter_id)
  AND (
    created_by = auth.uid()
    OR app_private.is_matter_owner(matter_id, auth.uid())
    OR app_private.has_role(auth.uid(), 'batonnier'::app_role)
  )
)
WITH CHECK (app_private.can_access_matter(matter_id));

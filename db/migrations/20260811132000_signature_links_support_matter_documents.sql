-- Allow the existing signature module to target either invoices or dossier documents.

ALTER TABLE public.signature_links
  ADD COLUMN IF NOT EXISTS matter_document_id uuid REFERENCES public.matter_documents(id) ON DELETE CASCADE;

ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS matter_document_id uuid REFERENCES public.matter_documents(id) ON DELETE CASCADE;

ALTER TABLE public.signature_events
  ADD COLUMN IF NOT EXISTS matter_document_id uuid REFERENCES public.matter_documents(id) ON DELETE CASCADE;

ALTER TABLE public.signature_links
  ALTER COLUMN invoice_id DROP NOT NULL;

ALTER TABLE public.document_signatures
  ALTER COLUMN invoice_id DROP NOT NULL;

ALTER TABLE public.signature_events
  ALTER COLUMN invoice_id DROP NOT NULL;

ALTER TABLE public.signature_links
  DROP CONSTRAINT IF EXISTS signature_links_target_xor;
ALTER TABLE public.signature_links
  ADD CONSTRAINT signature_links_target_xor
  CHECK (((invoice_id IS NOT NULL)::int + (matter_document_id IS NOT NULL)::int) = 1);

ALTER TABLE public.document_signatures
  DROP CONSTRAINT IF EXISTS document_signatures_target_xor;
ALTER TABLE public.document_signatures
  ADD CONSTRAINT document_signatures_target_xor
  CHECK (((invoice_id IS NOT NULL)::int + (matter_document_id IS NOT NULL)::int) = 1);

ALTER TABLE public.signature_events
  DROP CONSTRAINT IF EXISTS signature_events_target_xor;
ALTER TABLE public.signature_events
  ADD CONSTRAINT signature_events_target_xor
  CHECK (((invoice_id IS NOT NULL)::int + (matter_document_id IS NOT NULL)::int) = 1);

CREATE INDEX IF NOT EXISTS signature_links_matter_document_idx
  ON public.signature_links(matter_document_id);

CREATE INDEX IF NOT EXISTS document_signatures_matter_document_idx
  ON public.document_signatures(matter_document_id);

CREATE INDEX IF NOT EXISTS signature_events_matter_document_idx
  ON public.signature_events(matter_document_id, created_at DESC);

-- Base access policies
DROP POLICY IF EXISTS signature_links_select ON public.signature_links;
DROP POLICY IF EXISTS signature_links_insert ON public.signature_links;
DROP POLICY IF EXISTS signature_links_update ON public.signature_links;
DROP POLICY IF EXISTS signature_links_delete ON public.signature_links;
DROP POLICY IF EXISTS document_signatures_select ON public.document_signatures;
DROP POLICY IF EXISTS signature_events_select ON public.signature_events;

CREATE POLICY signature_links_select ON public.signature_links
  FOR SELECT TO authenticated
  USING (
    (invoice_id IS NOT NULL AND app_private.can_access_invoice(invoice_id))
    OR (
      matter_document_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.matter_documents d
        WHERE d.id = matter_document_id
          AND app_private.can_access_matter(d.matter_id)
      )
    )
  );

CREATE POLICY signature_links_insert ON public.signature_links
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (invoice_id IS NOT NULL AND app_private.can_access_invoice(invoice_id))
      OR (
        matter_document_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.matter_documents d
          WHERE d.id = matter_document_id
            AND app_private.can_access_matter(d.matter_id)
        )
      )
    )
  );

CREATE POLICY signature_links_update ON public.signature_links
  FOR UPDATE TO authenticated
  USING (
    (invoice_id IS NOT NULL AND app_private.can_access_invoice(invoice_id))
    OR (
      matter_document_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.matter_documents d
        WHERE d.id = matter_document_id
          AND app_private.can_access_matter(d.matter_id)
      )
    )
  )
  WITH CHECK (
    (invoice_id IS NOT NULL AND app_private.can_access_invoice(invoice_id))
    OR (
      matter_document_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.matter_documents d
        WHERE d.id = matter_document_id
          AND app_private.can_access_matter(d.matter_id)
      )
    )
  );

CREATE POLICY signature_links_delete ON public.signature_links
  FOR DELETE TO authenticated
  USING (
    (invoice_id IS NOT NULL AND app_private.can_access_invoice(invoice_id))
    OR (
      matter_document_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.matter_documents d
        WHERE d.id = matter_document_id
          AND app_private.can_access_matter(d.matter_id)
      )
    )
  );

CREATE POLICY document_signatures_select ON public.document_signatures
  FOR SELECT TO authenticated
  USING (
    (invoice_id IS NOT NULL AND app_private.can_access_invoice(invoice_id))
    OR (
      matter_document_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.matter_documents d
        WHERE d.id = matter_document_id
          AND app_private.can_access_matter(d.matter_id)
      )
    )
  );

CREATE POLICY signature_events_select ON public.signature_events
  FOR SELECT TO authenticated
  USING (
    (invoice_id IS NOT NULL AND app_private.can_access_invoice(invoice_id))
    OR (
      matter_document_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.matter_documents d
        WHERE d.id = matter_document_id
          AND app_private.can_access_matter(d.matter_id)
      )
    )
  );

-- Active-firm restrictive guards
DROP POLICY IF EXISTS signature_links_active_firm_guard ON public.signature_links;
CREATE POLICY signature_links_active_firm_guard ON public.signature_links
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND app_private.is_active_firm(i.firm_id)
    ))
    OR
    (matter_document_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.matter_documents d
      JOIN public.matters m ON m.id = d.matter_id
      WHERE d.id = matter_document_id
        AND app_private.is_active_firm(m.firm_id)
    ))
  )
  WITH CHECK (
    (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND app_private.is_active_firm(i.firm_id)
    ))
    OR
    (matter_document_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.matter_documents d
      JOIN public.matters m ON m.id = d.matter_id
      WHERE d.id = matter_document_id
        AND app_private.is_active_firm(m.firm_id)
    ))
  );

DROP POLICY IF EXISTS signature_events_active_firm_guard ON public.signature_events;
CREATE POLICY signature_events_active_firm_guard ON public.signature_events
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND app_private.is_active_firm(i.firm_id)
    ))
    OR
    (matter_document_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.matter_documents d
      JOIN public.matters m ON m.id = d.matter_id
      WHERE d.id = matter_document_id
        AND app_private.is_active_firm(m.firm_id)
    ))
  )
  WITH CHECK (
    (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND app_private.is_active_firm(i.firm_id)
    ))
    OR
    (matter_document_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.matter_documents d
      JOIN public.matters m ON m.id = d.matter_id
      WHERE d.id = matter_document_id
        AND app_private.is_active_firm(m.firm_id)
    ))
  );

DROP POLICY IF EXISTS document_signatures_active_firm_guard ON public.document_signatures;
CREATE POLICY document_signatures_active_firm_guard ON public.document_signatures
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND app_private.is_active_firm(i.firm_id)
    ))
    OR
    (matter_document_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.matter_documents d
      JOIN public.matters m ON m.id = d.matter_id
      WHERE d.id = matter_document_id
        AND app_private.is_active_firm(m.firm_id)
    ))
  )
  WITH CHECK (
    (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND app_private.is_active_firm(i.firm_id)
    ))
    OR
    (matter_document_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.matter_documents d
      JOIN public.matters m ON m.id = d.matter_id
      WHERE d.id = matter_document_id
        AND app_private.is_active_firm(m.firm_id)
    ))
  );

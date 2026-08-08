-- ============ SIGNATURE LINKS ============
CREATE TABLE public.signature_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz,
  max_opens integer,
  opens_count integer NOT NULL DEFAULT 0,
  pin_hash text,
  active boolean NOT NULL DEFAULT true,
  invalidate_on_sign boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  first_opened_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signature_links_invoice_idx ON public.signature_links(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signature_links TO authenticated;
GRANT ALL ON public.signature_links TO service_role;
ALTER TABLE public.signature_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signature_links_select" ON public.signature_links
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id));
CREATE POLICY "signature_links_insert" ON public.signature_links
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id));
CREATE POLICY "signature_links_update" ON public.signature_links
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id));
CREATE POLICY "signature_links_delete" ON public.signature_links
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id));

CREATE TRIGGER signature_links_updated_at
  BEFORE UPDATE ON public.signature_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SIGNATURES ============
CREATE TABLE public.document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.signature_links(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  signature_uid text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  method text NOT NULL CHECK (method IN ('drawn','generated')),
  style text,
  placements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ip_address text,
  user_agent text,
  storage_path text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_signatures_invoice_idx ON public.document_signatures(invoice_id);

GRANT SELECT ON public.document_signatures TO authenticated;
GRANT ALL ON public.document_signatures TO service_role;
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_signatures_select" ON public.document_signatures
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id));

-- ============ SIGNATURE EVENTS (timeline) ============
CREATE TABLE public.signature_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid REFERENCES public.signature_links(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_label text,
  actor_id uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signature_events_invoice_idx ON public.signature_events(invoice_id, created_at DESC);

GRANT SELECT ON public.signature_events TO authenticated;
GRANT ALL ON public.signature_events TO service_role;
ALTER TABLE public.signature_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signature_events_select" ON public.signature_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id));
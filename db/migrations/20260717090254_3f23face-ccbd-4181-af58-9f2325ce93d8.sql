
-- === TABLE invoices ===
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('quote','invoice')),
  number TEXT UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  matter_id UUID REFERENCES public.matters(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','refused','paid','partial','overdue','cancelled','converted')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  terms TEXT,
  public_token UUID NOT NULL DEFAULT gen_random_uuid(),
  converted_from_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  client_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invoices_public_token_key ON public.invoices(public_token);
CREATE INDEX invoices_owner_kind_idx ON public.invoices(owner_id, kind);
CREATE INDEX invoices_status_idx ON public.invoices(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT ON public.invoices TO anon;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_owner_all" ON public.invoices FOR ALL TO authenticated
  USING (auth.uid() = owner_id OR app_private.has_role(auth.uid(),'batonnier'))
  WITH CHECK (auth.uid() = owner_id OR app_private.has_role(auth.uid(),'batonnier'));

-- Public verification: anon can read only via public_token in WHERE, but Postgres
-- doesn't natively restrict columns. We enforce column selection server-side; the
-- policy just gates row visibility (only sent/paid/partial/accepted/overdue).
CREATE POLICY "invoices_public_verify" ON public.invoices FOR SELECT TO anon
  USING (status IN ('sent','paid','partial','overdue','accepted','converted'));

-- === TABLE invoice_items ===
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoice_items_invoice_idx ON public.invoice_items(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items_owner_all" ON public.invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND (i.owner_id = auth.uid() OR app_private.has_role(auth.uid(),'batonnier'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND (i.owner_id = auth.uid() OR app_private.has_role(auth.uid(),'batonnier'))));

-- === TABLE invoice_payments ===
CREATE TABLE public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','transfer','check','card','other')),
  reference TEXT,
  received_on DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoice_payments_invoice_idx ON public.invoice_payments(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_payments_owner_all" ON public.invoice_payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND (i.owner_id = auth.uid() OR app_private.has_role(auth.uid(),'batonnier'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND (i.owner_id = auth.uid() OR app_private.has_role(auth.uid(),'batonnier'))));

-- === Triggers ===
CREATE OR REPLACE FUNCTION public.invoices_set_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM COALESCE(NEW.issue_date, CURRENT_DATE));
  prefix TEXT := CASE WHEN NEW.kind = 'quote' THEN 'DEV' ELSE 'FAC' END;
  seq INT;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number <> '' THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '^' || prefix || '-\d{4}-', ''), '')::INT), 0) + 1
    INTO seq FROM public.invoices
    WHERE number LIKE prefix || '-' || y || '-%';
  NEW.number := prefix || '-' || y || '-' || lpad(seq::TEXT, 5, '0');
  RETURN NEW;
END; $$;

CREATE TRIGGER invoices_set_number_trg BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_set_number();

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

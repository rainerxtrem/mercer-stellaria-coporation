
-- 1) TABLE
CREATE TABLE public.firm_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_id, service)
);

CREATE INDEX firm_pricing_firm_idx ON public.firm_pricing(firm_id);

-- 2) GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_pricing TO authenticated;
GRANT ALL ON public.firm_pricing TO service_role;

-- 3) RLS
ALTER TABLE public.firm_pricing ENABLE ROW LEVEL SECURITY;

-- Read: batonnier OR member of the firm
CREATE POLICY firm_pricing_select ON public.firm_pricing
FOR SELECT TO authenticated
USING (
  app_private.has_role(auth.uid(), 'batonnier')
  OR firm_id = public.get_my_firm_id()
);

-- Write: batonnier OR (responsable_cabinet of the same firm)
CREATE POLICY firm_pricing_insert ON public.firm_pricing
FOR INSERT TO authenticated
WITH CHECK (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = public.get_my_firm_id()
  )
);

CREATE POLICY firm_pricing_update ON public.firm_pricing
FOR UPDATE TO authenticated
USING (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = public.get_my_firm_id()
  )
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = public.get_my_firm_id()
  )
);

CREATE POLICY firm_pricing_delete ON public.firm_pricing
FOR DELETE TO authenticated
USING (
  app_private.has_role(auth.uid(), 'batonnier')
  OR (
    app_private.has_role(auth.uid(), 'responsable_cabinet')
    AND firm_id = public.get_my_firm_id()
  )
);

-- 4) TRIGGERS
CREATE TRIGGER firm_pricing_set_updated_at
  BEFORE UPDATE ON public.firm_pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER firm_pricing_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.firm_pricing
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row();

-- 5) SEED — copy default global fee schedule to every existing firm
INSERT INTO public.firm_pricing (firm_id, service, price)
SELECT f.id, s.label, s.price
FROM public.firms f
CROSS JOIN (VALUES
  ('Représentation juridique lors d''un interrogatoire', 600),
  ('Représentation juridique lors d''un procès', 1200),
  ('Travail préparatoire à un dossier', 500),
  ('Consultation juridique simple', 300),
  ('Consultation juridique approfondie', 500),
  ('Rédaction d''une mise en demeure', 400),
  ('Contrat simple', 400),
  ('Contrat complexe', 700),
  ('Analyse juridique d''un dossier', 500),
  ('Recherche juridique', 300),
  ('Assistance médiation', 1000),
  ('Assistance négociation', 900),
  ('Dépôt d''une plainte', 500),
  ('Dépôt d''un appel', 700),
  ('Constitution d''un dossier complet', 1000),
  ('Rendez-vous client', 400),
  ('Rendez-vous partie adverse', 600),
  ('Comparution devant un juge', 1000),
  ('Demande de renvoi', 400),
  ('Assistance garde à vue', 800),
  ('Rédaction de conclusions', 600),
  ('Vérification d''un document', 600),
  ('Obtention de pièces administratives', 500),
  ('Déplacement hors juridiction', 800)
) AS s(label, price)
ON CONFLICT (firm_id, service) DO NOTHING;

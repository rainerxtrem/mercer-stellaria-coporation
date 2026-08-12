-- Multi-signer support for signature links (1 to 25 signers per batch).
-- Keeps RLS unchanged; only extends data model and integrity rules.

ALTER TABLE public.signature_links
  ADD COLUMN IF NOT EXISTS group_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS signer_index integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS signers_total integer DEFAULT 1;

UPDATE public.signature_links
SET
  group_token = COALESCE(group_token, gen_random_uuid()),
  signer_index = COALESCE(signer_index, 1),
  signers_total = COALESCE(signers_total, 1)
WHERE group_token IS NULL OR signer_index IS NULL OR signers_total IS NULL;

ALTER TABLE public.signature_links
  ALTER COLUMN group_token SET NOT NULL,
  ALTER COLUMN signer_index SET NOT NULL,
  ALTER COLUMN signers_total SET NOT NULL;

ALTER TABLE public.signature_links
  DROP CONSTRAINT IF EXISTS signature_links_signers_total_ck;
ALTER TABLE public.signature_links
  ADD CONSTRAINT signature_links_signers_total_ck
  CHECK (signers_total BETWEEN 1 AND 25);

ALTER TABLE public.signature_links
  DROP CONSTRAINT IF EXISTS signature_links_signer_index_ck;
ALTER TABLE public.signature_links
  ADD CONSTRAINT signature_links_signer_index_ck
  CHECK (signer_index BETWEEN 1 AND 25);

ALTER TABLE public.signature_links
  DROP CONSTRAINT IF EXISTS signature_links_signer_index_le_total_ck;
ALTER TABLE public.signature_links
  ADD CONSTRAINT signature_links_signer_index_le_total_ck
  CHECK (signer_index <= signers_total);

CREATE UNIQUE INDEX IF NOT EXISTS signature_links_group_signer_uidx
  ON public.signature_links(group_token, signer_index);

CREATE INDEX IF NOT EXISTS signature_links_matter_doc_group_idx
  ON public.signature_links(matter_document_id, group_token, created_at DESC);

CREATE INDEX IF NOT EXISTS signature_links_invoice_group_idx
  ON public.signature_links(invoice_id, group_token, created_at DESC);

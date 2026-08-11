-- Allow multiple accounting companies in the same firm to share the same Discord source.
-- Routing then relies on invoice prefix (H-/I-/L-/F-) and fallback rules.

DROP INDEX IF EXISTS public.accounting_companies_discord_unique_per_firm;

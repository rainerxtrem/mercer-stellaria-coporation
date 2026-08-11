-- Allow explicit emitter override/edit on accounting operations.
ALTER TABLE public.accounting_operations
  ADD COLUMN IF NOT EXISTS emitter_name text;

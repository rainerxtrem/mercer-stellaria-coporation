import { createServerFn } from "@tanstack/react-start";

// Anonymous visitors have no direct SELECT on public.lawyers: only the
// directory-safe columns are exposed through security-definer functions.
async function publicClient() {
  const { supabasePublic } = await import("@/integrations/supabase/client.server");
  return supabasePublic;
}

export const listPublicLawyers = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await publicClient();
  const { data, error } = await supabase.rpc("list_public_lawyers");
  if (error) return [];
  return ((data ?? []) as any[]).map((l) => ({
    id: l.id,
    license: l.license,
    first_name: l.first_name,
    last_name: l.last_name,
    photo_url: l.photo_url,
    specialty: l.specialty,
    city: l.city,
    status: l.status,
    admitted_on: l.admitted_on,
    firm_id: l.firm_id,
    firms: l.firm_name ? { name: l.firm_name } : null,
  }));
});


export const listPublicFirms = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await publicClient();
  const { data, error } = await supabase
    .from("firms")
    .select("id, number, name, address, manager, logo_url, status, created_at")
    .order("name");
  if (error) return [];
  return (data ?? []).map((f) => ({ ...f, createdOn: f.created_at }));
});

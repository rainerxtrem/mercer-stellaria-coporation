import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withActorNames } from "@/lib/activity-log";
import { z } from "zod";

// Champs "vides" côté client → null. On accepte string vide OU string valide OU null/undefined.
const optionalEmail = z
  .string()
  .trim()
  .max(255, { message: "L'email est trop long (255 caractères max)." })
  .email({ message: "L'adresse email n'est pas valide." })
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "La date doit être au format AAAA-MM-JJ." })
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

const clientSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, { message: "Le prénom est requis." })
    .max(80, { message: "Le prénom est trop long (80 caractères max)." }),
  last_name: z
    .string()
    .trim()
    .min(1, { message: "Le nom est requis." })
    .max(80, { message: "Le nom est trop long (80 caractères max)." }),
  email: optionalEmail,
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  birth_date: optionalDate,
  notes: z.string().max(5000).nullable().optional(),
});

function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join(" • ");
}

function safeParse(raw: unknown) {
  const parsed = clientSchema.safeParse(raw);
  if (!parsed.success) throw new Error(formatZodError(parsed.error));
  // Normalise "" -> null pour les champs texte optionnels
  const d = parsed.data;
  return {
    ...d,
    email: d.email ? d.email : null,
    phone: d.phone ? d.phone : null,
    address: d.address ? d.address : null,
    birth_date: d.birth_date ? d.birth_date : null,
    notes: d.notes ? d.notes : null,
  };
}

async function requireActiveFirmId(context: { supabase: any; userId: string; claims?: Record<string, unknown> }) {
  const fromClaims = (context.claims?.firm_id as string | undefined) ?? null;
  if (fromClaims) return fromClaims;
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("active_firm_id")
    .eq("id", context.userId)
    .maybeSingle();
  const firmId = (profile?.active_firm_id as string | null) ?? null;
  if (!firmId) throw new Error("Aucune entreprise active sélectionnée.");
  return firmId;
}

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { data, error } = await context.supabase
      .from("clients")
      .select("*")
      .eq("firm_id", firmId)
      .order("last_name");
    if (error) throw new Error(error.message);
    return withActorNames(context.supabase, data ?? [], {
      owner_id: "owner_name",
      updated_by: "updated_by_name",
    });
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { data: client, error } = await context.supabase
      .from("clients")
      .select("*")
      .eq("id", data.id)
      .eq("firm_id", firmId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Client introuvable");
    const [{ data: direct }, { data: linked }] = await Promise.all([
      context.supabase
        .from("matters")
        .select("id, number, title, status, opened_on")
        .eq("client_id", data.id)
        .eq("firm_id", firmId)
        .order("opened_on", { ascending: false }),
      context.supabase
        .from("matter_clients")
        .select("matters(id, number, title, status, opened_on)")
        .eq("client_id", data.id),
    ]);

    const map = new Map<string, any>();
    for (const matter of direct ?? []) map.set(matter.id, matter);
    for (const row of linked ?? []) {
      const matter = (row as any).matters;
      if (matter?.id) map.set(matter.id, matter);
    }

    const matters = Array.from(map.values()).sort((a, b) =>
      String(b.opened_on ?? "").localeCompare(String(a.opened_on ?? "")),
    );
    const [named] = await withActorNames(context.supabase, [client], {
      owner_id: "owner_name",
      updated_by: "updated_by_name",
    });
    return { client: named, matters };
  });


export const upsertClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string } & Record<string, unknown>) => {
    const { id, ...rest } = d;
    return { id, ...safeParse(rest) };
  })
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    if (data.id) {
      const { id, ...updates } = data;
      const { error } = await context.supabase.from("clients").update(updates).eq("id", id).eq("firm_id", firmId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { id: _i, ...insert } = data;
    const { data: created, error } = await context.supabase
      .from("clients")
      .insert({ ...insert, owner_id: context.userId, firm_id: firmId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id).eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

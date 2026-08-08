import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getRoles(ctx: { supabase: any; userId: string }): Promise<string[]> {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  return (data ?? []).map((r: any) => r.role);
}

async function getMyFirmId(ctx: { supabase: any; userId: string }): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("lawyers").select("firm_id").eq("profile_id", ctx.userId).maybeSingle();
  return (data?.firm_id ?? null) as string | null;
}

/** List pricing rows for a firm. Members see their own firm; batonnier can pass firmId. */
export const listFirmPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ firmId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context);
    const isBat = roles.includes("batonnier");
    let firmId = data.firmId ?? null;
    if (!firmId) firmId = await getMyFirmId(context);
    if (!firmId) return [];
    if (!isBat) {
      const mine = await getMyFirmId(context);
      if (mine !== firmId) throw new Error("Accès refusé à ce cabinet.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("firm_pricing")
      .select("id, firm_id, service, description, price, active, updated_at, updated_by")
      .eq("firm_id", firmId)
      .order("service");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  firm_id: z.string().uuid().optional(),
  service: z.string().trim().min(2).max(200),
  description: z.string().trim().max(500).nullable().optional(),
  price: z.number().min(0).max(1_000_000),
  active: z.boolean().default(true),
});

async function assertWriteAccess(context: any, firmId: string) {
  const roles = await getRoles(context);
  if (roles.includes("batonnier")) return;
  if (!roles.includes("responsable_cabinet")) throw new Error("Accès refusé : Directeur de cabinet requis.");
  const mine = await getMyFirmId(context);
  if (mine !== firmId) throw new Error("Vous ne pouvez modifier que votre propre cabinet.");
}

export const upsertFirmPricingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const firmId = data.firm_id ?? (await getMyFirmId(context));
    if (!firmId) throw new Error("Aucun cabinet cible.");
    await assertWriteAccess(context, firmId);
    const payload = {
      firm_id: firmId,
      service: data.service,
      description: data.description ?? null,
      price: data.price,
      active: data.active,
      updated_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("firm_pricing").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("firm_pricing").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteFirmPricingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: e1 } = await supabaseAdmin
      .from("firm_pricing").select("firm_id").eq("id", data.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("Prestation introuvable.");
    await assertWriteAccess(context, row.firm_id);
    const { error } = await context.supabase.from("firm_pricing").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

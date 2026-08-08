import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function isBatonnier(context: Ctx) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "batonnier")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function assertBatonnier(context: Ctx) {
  if (!(await isBatonnier(context))) {
    throw new Error("Acces reserve a l'administration corporate.");
  }
}

async function assertEnterpriseManager(context: Ctx, firmId: string) {
  const { data: allowed, error } = await context.supabase.rpc("can_manage_enterprise", {
    _firm_id: firmId,
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  if (!allowed) throw new Error("Acces refuse: gestion entreprise requise.");
}

const colorSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, "Couleur hexadecimale invalide")
  .nullable()
  .optional();

export const listEnterpriseModuleCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const { data, error } = await context.supabase
      .from("enterprise_module_catalog")
      .select("slug, label, description, route_path, nav_group, icon_name, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listEnterprisesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const [{ data: firms, error }, { data: modules }, { data: grades }] = await Promise.all([
      context.supabase
        .from("firms")
        .select("id, number, name, status, logo_url, manager, brand_primary_color, brand_secondary_color, brand_accent_color")
        .order("name", { ascending: true }),
      context.supabase
        .from("enterprise_modules")
        .select("firm_id, module_slug, enabled"),
      context.supabase
        .from("enterprise_grades")
        .select("id, firm_id"),
    ]);
    if (error) throw new Error(error.message);
    const byFirmModules = new Map<string, { enabled: number; total: number }>();
    for (const row of modules ?? []) {
      const acc = byFirmModules.get(row.firm_id) ?? { enabled: 0, total: 0 };
      acc.total += 1;
      if (row.enabled) acc.enabled += 1;
      byFirmModules.set(row.firm_id, acc);
    }
    const byFirmGrades = new Map<string, number>();
    for (const grade of grades ?? []) {
      byFirmGrades.set(grade.firm_id, (byFirmGrades.get(grade.firm_id) ?? 0) + 1);
    }

    return (firms ?? []).map((firm: any) => ({
      ...firm,
      modules_enabled: byFirmModules.get(firm.id)?.enabled ?? 0,
      modules_total: byFirmModules.get(firm.id)?.total ?? 0,
      grades_total: byFirmGrades.get(firm.id) ?? 0,
    }));
  });

export const createEnterprise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      number: string;
      name: string;
      address?: string | null;
      manager?: string | null;
      logo_url?: string | null;
      brand_primary_color?: string | null;
      brand_secondary_color?: string | null;
      brand_accent_color?: string | null;
      visual_identity?: Record<string, unknown> | null;
      settings?: Record<string, unknown> | null;
      enabled_module_slugs?: string[];
    }) => ({
      number: z.string().trim().min(2).max(30).parse(d.number),
      name: z.string().trim().min(2).max(120).parse(d.name),
      address: z.string().trim().max(200).nullable().optional().parse(d.address ?? null),
      manager: z.string().trim().max(120).nullable().optional().parse(d.manager ?? null),
      logo_url: z.string().trim().url().max(500).nullable().optional().parse(d.logo_url ?? null),
      brand_primary_color: colorSchema.parse(d.brand_primary_color ?? null),
      brand_secondary_color: colorSchema.parse(d.brand_secondary_color ?? null),
      brand_accent_color: colorSchema.parse(d.brand_accent_color ?? null),
      visual_identity: z.record(z.any()).nullable().optional().parse(d.visual_identity ?? {}),
      settings: z.record(z.any()).nullable().optional().parse(d.settings ?? {}),
      enabled_module_slugs: z.array(z.string().min(1)).default([]).parse(d.enabled_module_slugs ?? []),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await context.supabase
      .from("firms")
      .insert({
        number: data.number,
        name: data.name,
        address: data.address,
        manager: data.manager,
        logo_url: data.logo_url,
        brand_primary_color: data.brand_primary_color,
        brand_secondary_color: data.brand_secondary_color,
        brand_accent_color: data.brand_accent_color,
        visual_identity: data.visual_identity ?? {},
        settings: data.settings ?? {},
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    const firmId = created.id as string;

    const { data: catalog, error: cErr } = await context.supabase
      .from("enterprise_module_catalog")
      .select("slug")
      .eq("is_active", true);
    if (cErr) throw new Error(cErr.message);

    const enabledSet = new Set(data.enabled_module_slugs);
    const moduleRows = (catalog ?? []).map((m: any) => ({
      firm_id: firmId,
      module_slug: m.slug,
      enabled: enabledSet.size === 0 ? true : enabledSet.has(m.slug),
    }));

    if (moduleRows.length > 0) {
      const { error: mErr } = await context.supabase.from("enterprise_modules").insert(moduleRows);
      if (mErr) throw new Error(mErr.message);
    }

    const { data: managerGrade } = await context.supabase
      .from("enterprise_grades")
      .select("id")
      .eq("firm_id", firmId)
      .eq("code", "manager")
      .maybeSingle();

    const { data: membership } = await context.supabase
      .from("enterprise_memberships")
      .upsert(
        {
          user_id: context.userId,
          firm_id: firmId,
          status: "active",
          is_default: false,
          created_by: context.userId,
        },
        { onConflict: "user_id,firm_id" },
      )
      .select("id")
      .single();

    if (membership?.id && managerGrade?.id) {
      await context.supabase
        .from("enterprise_member_grades")
        .upsert({ membership_id: membership.id, grade_id: managerGrade.id }, { onConflict: "membership_id,grade_id" });
    }

    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      entity_type: "enterprise",
      entity_id: firmId,
      action: "enterprise_create",
      summary: `Entreprise ${data.name} creee`,
      changes: {
        modules_enabled: moduleRows.filter((r) => r.enabled).map((r) => r.module_slug),
      },
    });

    return { id: firmId };
  });

export const getEnterpriseAdminDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { firm_id: string }) => ({ firm_id: z.string().uuid().parse(d.firm_id) }))
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);

    const [{ data: firm, error }, { data: modules }, { data: grades }, { data: members }, { data: permissions }] = await Promise.all([
      context.supabase
        .from("firms")
        .select("id, number, name, address, manager, logo_url, status, brand_primary_color, brand_secondary_color, brand_accent_color, visual_identity, settings")
        .eq("id", data.firm_id)
        .maybeSingle(),
      context.supabase
        .from("enterprise_modules")
        .select("module_slug, enabled, enterprise_module_catalog(label, description, route_path, icon_name, nav_group, sort_order)")
        .eq("firm_id", data.firm_id),
      context.supabase
        .from("enterprise_grades")
        .select("id, code, name, description, is_system")
        .eq("firm_id", data.firm_id)
        .order("name", { ascending: true }),
      context.supabase
        .from("enterprise_memberships")
        .select("id, user_id, status, is_default, profiles(full_name)")
        .eq("firm_id", data.firm_id)
        .order("created_at", { ascending: true }),
      context.supabase.from("enterprise_permissions_catalog").select("permission_key, module_slug, label, description"),
    ]);
    if (error) throw new Error(error.message);

    const gradeIds = (grades ?? []).map((g: any) => g.id);
    const membershipIds = (members ?? []).map((m: any) => m.id);

    const [{ data: gradeModules }, { data: gradePermissions }, { data: memberGrades }] = await Promise.all([
      gradeIds.length > 0
        ? context.supabase.from("enterprise_grade_modules").select("grade_id, module_slug, allowed").in("grade_id", gradeIds)
        : Promise.resolve({ data: [] as any[] }),
      gradeIds.length > 0
        ? context.supabase.from("enterprise_grade_permissions").select("grade_id, permission_key").in("grade_id", gradeIds)
        : Promise.resolve({ data: [] as any[] }),
      membershipIds.length > 0
        ? context.supabase.from("enterprise_member_grades").select("membership_id, grade_id").in("membership_id", membershipIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const gradeById = new Map<string, any>();
    for (const grade of grades ?? []) gradeById.set(grade.id, grade);

    const moduleEnabled = new Set<string>();
    for (const module of modules ?? []) {
      if (module.enabled) moduleEnabled.add(module.module_slug);
    }

    const allowedModulesByGrade = new Map<string, Set<string>>();
    for (const row of gradeModules ?? []) {
      if (!row.allowed) continue;
      const set = allowedModulesByGrade.get(row.grade_id) ?? new Set<string>();
      set.add(row.module_slug);
      allowedModulesByGrade.set(row.grade_id, set);
    }

    const permissionsByGrade = new Map<string, Set<string>>();
    for (const row of gradePermissions ?? []) {
      const set = permissionsByGrade.get(row.grade_id) ?? new Set<string>();
      set.add(row.permission_key);
      permissionsByGrade.set(row.grade_id, set);
    }

    const gradeIdsByMembership = new Map<string, string[]>();
    for (const row of memberGrades ?? []) {
      const list = gradeIdsByMembership.get(row.membership_id) ?? [];
      list.push(row.grade_id);
      gradeIdsByMembership.set(row.membership_id, list);
    }

    const memberEffectiveAccess = (members ?? []).map((member: any) => {
      const assignedGradeIds = gradeIdsByMembership.get(member.id) ?? [];
      const assignedGrades = assignedGradeIds
        .map((id) => gradeById.get(id))
        .filter(Boolean);

      const effectiveModuleSet = new Set<string>();
      const effectivePermissionSet = new Set<string>();
      for (const gradeId of assignedGradeIds) {
        for (const moduleSlug of allowedModulesByGrade.get(gradeId) ?? new Set<string>()) {
          if (moduleEnabled.has(moduleSlug)) effectiveModuleSet.add(moduleSlug);
        }
        for (const permissionKey of permissionsByGrade.get(gradeId) ?? new Set<string>()) {
          effectivePermissionSet.add(permissionKey);
        }
      }

      const hasLawyerGrade = assignedGrades.some((grade: any) => {
        const code = String(grade.code ?? "").toLowerCase();
        const name = String(grade.name ?? "").toLowerCase();
        return code === "lawyer" || name === "avocat" || name === "lawyer";
      });

      return {
        membership_id: member.id,
        user_id: member.user_id,
        grade_ids: assignedGradeIds,
        grade_names: assignedGrades.map((grade: any) => grade.name),
        effective_modules: Array.from(effectiveModuleSet).sort(),
        effective_permissions: Array.from(effectivePermissionSet).sort(),
        has_lawyer_grade: hasLawyerGrade,
      };
    });

    const memberIds = (members ?? []).map((member: any) => member.user_id).filter(Boolean);
    const userEmailMap = new Map<string, string | null>();
    if (memberIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const user of users.data?.users ?? []) {
        if (memberIds.includes(user.id)) {
          userEmailMap.set(user.id, user.email ?? null);
        }
      }
    }

    const membersWithIdentity = (members ?? []).map((member: any) => ({
      ...member,
      email: userEmailMap.get(member.user_id) ?? null,
    }));

    return {
      firm,
      modules: modules ?? [],
      grades: grades ?? [],
      members: membersWithIdentity,
      permissions: permissions ?? [],
      grade_modules: gradeModules ?? [],
      grade_permissions: gradePermissions ?? [],
      member_grades: memberGrades ?? [],
      member_effective_access: memberEffectiveAccess,
    };
  });

export const updateEnterpriseSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      firm_id: string;
      name: string;
      number: string;
      status?: "active" | "suspended" | "revoked";
      address?: string | null;
      manager?: string | null;
      logo_url?: string | null;
      brand_primary_color?: string | null;
      brand_secondary_color?: string | null;
      brand_accent_color?: string | null;
      visual_identity?: Record<string, unknown> | null;
      settings?: Record<string, unknown> | null;
    }) => ({
      firm_id: z.string().uuid().parse(d.firm_id),
      name: z.string().trim().min(2).max(120).parse(d.name),
      number: z.string().trim().min(2).max(30).parse(d.number),
      status: z.enum(["active", "suspended", "revoked"]).default("active").parse(d.status ?? "active"),
      address: z.string().trim().max(200).nullable().optional().parse(d.address ?? null),
      manager: z.string().trim().max(120).nullable().optional().parse(d.manager ?? null),
      logo_url: z.string().trim().url().max(500).nullable().optional().parse(d.logo_url ?? null),
      brand_primary_color: colorSchema.parse(d.brand_primary_color ?? null),
      brand_secondary_color: colorSchema.parse(d.brand_secondary_color ?? null),
      brand_accent_color: colorSchema.parse(d.brand_accent_color ?? null),
      visual_identity: z.record(z.any()).nullable().optional().parse(d.visual_identity ?? {}),
      settings: z.record(z.any()).nullable().optional().parse(d.settings ?? {}),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);

    const { error } = await context.supabase
      .from("firms")
      .update({
        name: data.name,
        number: data.number,
        status: data.status,
        address: data.address,
        manager: data.manager,
        logo_url: data.logo_url,
        brand_primary_color: data.brand_primary_color,
        brand_secondary_color: data.brand_secondary_color,
        brand_accent_color: data.brand_accent_color,
        visual_identity: data.visual_identity ?? {},
        settings: data.settings ?? {},
      })
      .eq("id", data.firm_id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateEnterpriseModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { firm_id: string; enabled_module_slugs: string[] }) => ({
    firm_id: z.string().uuid().parse(d.firm_id),
    enabled_module_slugs: z.array(z.string().min(1)).parse(d.enabled_module_slugs ?? []),
  }))
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);

    const { data: catalog, error } = await context.supabase
      .from("enterprise_module_catalog")
      .select("slug")
      .eq("is_active", true);
    if (error) throw new Error(error.message);

    const enabledSet = new Set(data.enabled_module_slugs);
    for (const module of catalog ?? []) {
      const { error: uErr } = await context.supabase
        .from("enterprise_modules")
        .upsert(
          {
            firm_id: data.firm_id,
            module_slug: module.slug,
            enabled: enabledSet.has(module.slug),
          },
          { onConflict: "firm_id,module_slug" },
        );
      if (uErr) throw new Error(uErr.message);
    }

    return { ok: true };
  });

export const upsertEnterpriseGrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; firm_id: string; code: string; name: string; description?: string | null }) => ({
    id: z.string().uuid().optional().parse(d.id),
    firm_id: z.string().uuid().parse(d.firm_id),
    code: z.string().trim().min(2).max(50).regex(/^[a-z0-9_\-]+$/i).parse(d.code),
    name: z.string().trim().min(2).max(80).parse(d.name),
    description: z.string().trim().max(500).nullable().optional().parse(d.description ?? null),
  }))
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);

    if (data.id) {
      const { error } = await context.supabase
        .from("enterprise_grades")
        .update({ code: data.code, name: data.name, description: data.description })
        .eq("id", data.id)
        .eq("firm_id", data.firm_id)
        .eq("is_system", false);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: created, error } = await context.supabase
      .from("enterprise_grades")
      .insert({
        firm_id: data.firm_id,
        code: data.code,
        name: data.name,
        description: data.description,
        is_system: false,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteEnterpriseGrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; firm_id: string }) => ({
    id: z.string().uuid().parse(d.id),
    firm_id: z.string().uuid().parse(d.firm_id),
  }))
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);
    const { error } = await context.supabase
      .from("enterprise_grades")
      .delete()
      .eq("id", data.id)
      .eq("firm_id", data.firm_id)
      .eq("is_system", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setEnterpriseGradeModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { firm_id: string; grade_id: string; allowed_module_slugs: string[] }) => ({
    firm_id: z.string().uuid().parse(d.firm_id),
    grade_id: z.string().uuid().parse(d.grade_id),
    allowed_module_slugs: z.array(z.string().min(1)).parse(d.allowed_module_slugs ?? []),
  }))
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);

    const { data: catalog, error } = await context.supabase
      .from("enterprise_module_catalog")
      .select("slug")
      .eq("is_active", true);
    if (error) throw new Error(error.message);

    const allowed = new Set(data.allowed_module_slugs);
    for (const module of catalog ?? []) {
      const { error: uErr } = await context.supabase
        .from("enterprise_grade_modules")
        .upsert(
          {
            grade_id: data.grade_id,
            module_slug: module.slug,
            allowed: allowed.has(module.slug),
          },
          { onConflict: "grade_id,module_slug" },
        );
      if (uErr) throw new Error(uErr.message);
    }

    return { ok: true };
  });

export const setEnterpriseGradePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { firm_id: string; grade_id: string; permission_keys: string[] }) => ({
    firm_id: z.string().uuid().parse(d.firm_id),
    grade_id: z.string().uuid().parse(d.grade_id),
    permission_keys: z.array(z.string().min(2)).parse(d.permission_keys ?? []),
  }))
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);

    const { error: delErr } = await context.supabase
      .from("enterprise_grade_permissions")
      .delete()
      .eq("grade_id", data.grade_id);
    if (delErr) throw new Error(delErr.message);

    if (data.permission_keys.length > 0) {
      const { error } = await context.supabase.from("enterprise_grade_permissions").insert(
        data.permission_keys.map((permissionKey) => ({
          grade_id: data.grade_id,
          permission_key: permissionKey,
        })),
      );
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const upsertEnterpriseMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { firm_id: string; user_id: string; status?: "active" | "suspended"; is_default?: boolean }) => ({
    firm_id: z.string().uuid().parse(d.firm_id),
    user_id: z.string().uuid().parse(d.user_id),
    status: z.enum(["active", "suspended"]).default("active").parse(d.status ?? "active"),
    is_default: z.boolean().default(false).parse(d.is_default ?? false),
  }))
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);

    const { data: membership, error } = await context.supabase
      .from("enterprise_memberships")
      .upsert(
        {
          firm_id: data.firm_id,
          user_id: data.user_id,
          status: data.status,
          is_default: data.is_default,
          created_by: context.userId,
        },
        { onConflict: "user_id,firm_id" },
      )
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { membership_id: membership.id as string };
  });

export const setEnterpriseMemberGrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { firm_id: string; membership_id: string; grade_ids: string[] }) => ({
    firm_id: z.string().uuid().parse(d.firm_id),
    membership_id: z.string().uuid().parse(d.membership_id),
    grade_ids: z.array(z.string().uuid()).parse(d.grade_ids ?? []),
  }))
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);

    const { error: delErr } = await context.supabase
      .from("enterprise_member_grades")
      .delete()
      .eq("membership_id", data.membership_id);
    if (delErr) throw new Error(delErr.message);

    if (data.grade_ids.length > 0) {
      const { error } = await context.supabase.from("enterprise_member_grades").insert(
        data.grade_ids.map((gradeId) => ({ membership_id: data.membership_id, grade_id: gradeId })),
      );
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const removeEnterpriseMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { firm_id: string; membership_id: string }) => ({
    firm_id: z.string().uuid().parse(d.firm_id),
    membership_id: z.string().uuid().parse(d.membership_id),
  }))
  .handler(async ({ data, context }) => {
    await assertEnterpriseManager(context, data.firm_id);

    const { error } = await context.supabase
      .from("enterprise_memberships")
      .delete()
      .eq("id", data.membership_id)
      .eq("firm_id", data.firm_id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listUserLookup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q?: string | null }) => ({ q: z.string().trim().max(80).nullable().optional().parse(d.q ?? null) }))
  .handler(async ({ data, context }) => {
    if (!(await isBatonnier(context))) {
      throw new Error("Acces reserve a l'administration corporate.");
    }

    const q = data.q?.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const rows = users.data?.users ?? [];
    return rows
      .map((user: any) => ({
        id: user.id as string,
        email: (user.email ?? "") as string,
        full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
      }))
      .filter((row: any) => {
        if (!q) return true;
        return row.email.toLowerCase().includes(q) || String(row.full_name ?? "").toLowerCase().includes(q);
      })
      .slice(0, 100);
  });

export const setMyActiveEnterprise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { firm_id: string }) => ({ firm_id: z.string().uuid().parse(d.firm_id) }))
  .handler(async ({ data, context }) => {
    const { data: membership, error } = await context.supabase
      .from("enterprise_memberships")
      .select("id")
      .eq("user_id", context.userId)
      .eq("firm_id", data.firm_id)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!membership && !(await isBatonnier(context))) {
      throw new Error("Vous n'avez pas acces a cette entreprise.");
    }

    const { error: pErr } = await context.supabase
      .from("profiles")
      .update({ active_firm_id: data.firm_id })
      .eq("id", context.userId);

    if (pErr) throw new Error(pErr.message);
    return { ok: true, firm_id: data.firm_id };
  });

export const getMyEnterpriseContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: memberships, error }, { data: allModules }, { data: routes }] = await Promise.all([
      context.supabase
        .from("enterprise_memberships")
        .select("id, firm_id, is_default, status, firms(number, name, logo_url)")
        .eq("user_id", context.userId)
        .eq("status", "active"),
      context.supabase
        .from("enterprise_module_catalog")
        .select("slug, label, route_path, nav_group, icon_name, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      context.supabase
        .from("enterprise_module_targets")
        .select("module_slug, target_kind, target_name")
        .eq("target_kind", "route"),
    ]);

    if (error) throw new Error(error.message);

    const membershipIds = (memberships ?? []).map((m: any) => m.id);
    const firmIds = (memberships ?? []).map((m: any) => m.firm_id);

    const [{ data: memberGrades }, { data: grades }, { data: gradeModules }, { data: enterpriseModules }, { data: profile }] = await Promise.all([
      membershipIds.length > 0
        ? context.supabase
            .from("enterprise_member_grades")
            .select("membership_id, grade_id")
            .in("membership_id", membershipIds)
        : Promise.resolve({ data: [] as any[] }),
      firmIds.length > 0
        ? context.supabase
            .from("enterprise_grades")
            .select("id, firm_id, name")
            .in("firm_id", firmIds)
        : Promise.resolve({ data: [] as any[] }),
      firmIds.length > 0
        ? context.supabase
            .from("enterprise_grade_modules")
            .select("grade_id, module_slug, allowed")
            .in("grade_id", (membershipIds.length > 0 ? (await context.supabase.from("enterprise_member_grades").select("grade_id").in("membership_id", membershipIds)).data ?? [] : []).map((r: any) => r.grade_id))
        : Promise.resolve({ data: [] as any[] }),
      firmIds.length > 0
        ? context.supabase
            .from("enterprise_modules")
            .select("firm_id, module_slug, enabled")
            .in("firm_id", firmIds)
        : Promise.resolve({ data: [] as any[] }),
      context.supabase
        .from("profiles")
        .select("active_firm_id")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);

    const isCorporateAdmin = await isBatonnier(context);

    const gradeById = new Map<string, any>();
    for (const grade of grades ?? []) gradeById.set(grade.id, grade);

    const gradesByMembership = new Map<string, string[]>();
    const gradeIdsByMembership = new Map<string, string[]>();
    for (const row of memberGrades ?? []) {
      const grade = gradeById.get(row.grade_id);
      const names = gradesByMembership.get(row.membership_id) ?? [];
      const ids = gradeIdsByMembership.get(row.membership_id) ?? [];
      if (grade?.name) names.push(grade.name);
      ids.push(row.grade_id);
      gradesByMembership.set(row.membership_id, names);
      gradeIdsByMembership.set(row.membership_id, ids);
    }

    const allowedModuleByMembership = new Map<string, Set<string>>();
    for (const membership of memberships ?? []) {
      allowedModuleByMembership.set(membership.id, new Set<string>());
    }

    const modulesEnabledByFirm = new Map<string, Set<string>>();
    for (const row of enterpriseModules ?? []) {
      const set = modulesEnabledByFirm.get(row.firm_id) ?? new Set<string>();
      if (row.enabled) set.add(row.module_slug);
      modulesEnabledByFirm.set(row.firm_id, set);
    }

    const allowedByGrade = new Map<string, Set<string>>();
    for (const row of gradeModules ?? []) {
      if (!row.allowed) continue;
      const set = allowedByGrade.get(row.grade_id) ?? new Set<string>();
      set.add(row.module_slug);
      allowedByGrade.set(row.grade_id, set);
    }

    for (const membership of memberships ?? []) {
      const allowed = allowedModuleByMembership.get(membership.id) ?? new Set<string>();
      for (const gradeId of gradeIdsByMembership.get(membership.id) ?? []) {
        for (const moduleSlug of allowedByGrade.get(gradeId) ?? new Set<string>()) {
          allowed.add(moduleSlug);
        }
      }
      allowedModuleByMembership.set(membership.id, allowed);
    }

    const enterpriseRows = (memberships ?? []).map((membership: any) => {
      const enabled = modulesEnabledByFirm.get(membership.firm_id) ?? new Set<string>();
      const allowed = allowedModuleByMembership.get(membership.id) ?? new Set<string>();
      const modules = Array.from(enabled).filter((slug) => isCorporateAdmin || allowed.has(slug));
      return {
        membership_id: membership.id as string,
        firm_id: membership.firm_id as string,
        number: membership.firms?.number ?? "",
        name: membership.firms?.name ?? "Entreprise",
        logo_url: membership.firms?.logo_url ?? null,
        grade_names: gradesByMembership.get(membership.id) ?? [],
        modules,
      };
    });

    const firstEnterprise = enterpriseRows[0] ?? null;
    const preferredFirmId = profile?.active_firm_id as string | null;
    const activeEnterprise =
      enterpriseRows.find((row: any) => row.firm_id === preferredFirmId) ??
      firstEnterprise;

    const moduleCatalog = (allModules ?? []).map((m: any) => ({
      slug: m.slug,
      label: m.label,
      route_path: m.route_path,
      nav_group: m.nav_group,
      icon_name: m.icon_name,
      sort_order: m.sort_order,
    }));

    const allowedSet = new Set(activeEnterprise?.modules ?? []);
    const navModules = moduleCatalog.filter((m: any) => allowedSet.has(m.slug));

    const knownRouteTargets = routes ?? [];
    const allRouteByModule = new Map<string, string[]>();
    for (const row of knownRouteTargets) {
      const list = allRouteByModule.get(row.module_slug) ?? [];
      list.push(row.target_name);
      allRouteByModule.set(row.module_slug, list);
    }

    return {
      enterprises: enterpriseRows,
      active_firm_id: activeEnterprise?.firm_id ?? null,
      active_membership_id: activeEnterprise?.membership_id ?? null,
      active_modules: activeEnterprise?.modules ?? [],
      nav_modules: navModules,
      all_modules: moduleCatalog,
      known_route_targets: Array.from(allRouteByModule.entries()).map(([module_slug, paths]) => ({ module_slug, paths })),
      is_corporate_admin: isCorporateAdmin,
    };
  });

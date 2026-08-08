import { afterAll, describe, expect, it } from "vitest";

import { createServerClient } from "@/integrations/supabase/client.server";
import { adminCreateUser, adminDeleteUser } from "@/backend/auth/service";
import { SERVICE_CONTEXT, withSession } from "@/backend/db/execute";
import { canAuthenticate } from "./helpers";

const createdUserIds: string[] = [];
const createdFirmIds: string[] = [];
const createdMatterIds: string[] = [];

type Seed = {
  userA: string;
  userB: string;
  firmA: string;
  firmB: string;
};

async function seed(): Promise<Seed> {
  if (!canAuthenticate) throw new Error("DATABASE_URL / AUTH_JWT_SECRET unavailable");

  const a = await adminCreateUser({
    email: `multi-a-${Math.random().toString(36).slice(2, 10)}@example.com`,
    password: "TestPass!2026",
    email_confirm: true,
  });
  const b = await adminCreateUser({
    email: `multi-b-${Math.random().toString(36).slice(2, 10)}@example.com`,
    password: "TestPass!2026",
    email_confirm: true,
  });
  createdUserIds.push(a.id, b.id);

  const service = createServerClient(SERVICE_CONTEXT);

  const { data: firmA } = await service
    .from("firms")
    .insert({ number: `ENTA-${Date.now()}`, name: "Entreprise Alpha", status: "active" } as never)
    .select("id")
    .single();
  const { data: firmB } = await service
    .from("firms")
    .insert({ number: `ENTB-${Date.now()}`, name: "Entreprise Beta", status: "active" } as never)
    .select("id")
    .single();

  if (!firmA?.id || !firmB?.id) throw new Error("Unable to create firms");
  createdFirmIds.push(firmA.id, firmB.id);

  await service
    .from("enterprise_modules")
    .upsert([
      { firm_id: firmA.id, module_slug: "matters", enabled: true },
      { firm_id: firmB.id, module_slug: "matters", enabled: false },
      { firm_id: firmA.id, module_slug: "clients", enabled: true },
      { firm_id: firmB.id, module_slug: "clients", enabled: true },
    ] as never);

  const { data: gradeA } = await service
    .from("enterprise_grades")
    .insert({ firm_id: firmA.id, code: `qa_${Date.now()}_a`, name: "QA Grade A", is_system: false } as never)
    .select("id")
    .single();
  const { data: gradeB } = await service
    .from("enterprise_grades")
    .insert({ firm_id: firmB.id, code: `qa_${Date.now()}_b`, name: "QA Grade B", is_system: false } as never)
    .select("id")
    .single();

  if (!gradeA?.id || !gradeB?.id) throw new Error("Unable to create grades");

  await service
    .from("enterprise_grade_modules")
    .upsert([
      { grade_id: gradeA.id, module_slug: "matters", allowed: true },
      { grade_id: gradeB.id, module_slug: "matters", allowed: true },
    ] as never);

  const { data: mA } = await service
    .from("enterprise_memberships")
    .insert({ user_id: a.id, firm_id: firmA.id, status: "active", is_default: true } as never)
    .select("id")
    .single();
  const { data: mB } = await service
    .from("enterprise_memberships")
    .insert({ user_id: a.id, firm_id: firmB.id, status: "active", is_default: false } as never)
    .select("id")
    .single();

  const { data: mBUser2 } = await service
    .from("enterprise_memberships")
    .insert({ user_id: b.id, firm_id: firmB.id, status: "active", is_default: true } as never)
    .select("id")
    .single();

  if (!mA?.id || !mB?.id || !mBUser2?.id) throw new Error("Unable to create memberships");

  await service
    .from("enterprise_member_grades")
    .insert([
      { membership_id: mA.id, grade_id: gradeA.id },
      { membership_id: mB.id, grade_id: gradeB.id },
      { membership_id: mBUser2.id, grade_id: gradeB.id },
    ] as never);

  await service
    .from("profiles")
    .upsert([
      { id: a.id, full_name: "Multi A", active_firm_id: firmA.id },
      { id: b.id, full_name: "Multi B", active_firm_id: firmB.id },
    ] as never);

  return { userA: a.id, userB: b.id, firmA: firmA.id, firmB: firmB.id };
}

function userClient(userId: string, firmId: string) {
  return createServerClient({
    role: "authenticated",
    claims: {
      sub: userId,
      role: "authenticated",
      session_id: `sess_${userId.slice(0, 8)}`,
      firm_id: firmId,
    },
  });
}

describe("Multi-entreprise modulaire", () => {
  it.skipIf(!canAuthenticate)("bloque un module desactive selon l'entreprise active", async () => {
    const ctx = await seed();

    const clientA = userClient(ctx.userA, ctx.firmA);
    const insert = await clientA
      .from("matters")
      .insert({ title: "Matter Alpha", owner_id: ctx.userA, number: "", status: "open" } as never)
      .select("id")
      .single();

    expect(insert.error).toBeNull();
    expect(insert.data?.id).toBeTruthy();
    if (insert.data?.id) createdMatterIds.push(insert.data.id as string);

    const clientBContext = userClient(ctx.userA, ctx.firmB);
    const denied = await clientBContext.from("matters").select("id").limit(1);
    expect(denied.error).not.toBeNull();
    expect(denied.error?.code).toBe("42501");
  });

  it.skipIf(!canAuthenticate)("isole les donnees entre entreprises", async () => {
    const ctx = await seed();

    const service = createServerClient(SERVICE_CONTEXT);
    const { data: row } = await service
      .from("matters")
      .insert({ title: "Matter Beta", owner_id: ctx.userB, number: "", status: "open" } as never)
      .select("id")
      .single();
    if (row?.id) createdMatterIds.push(row.id as string);

    const clientA = userClient(ctx.userA, ctx.firmA);
    const list = await clientA.from("matters").select("id, title");

    expect(list.error).toBeNull();
    expect((list.data ?? []).some((item: any) => item.id === row?.id)).toBe(false);
  });

  it.skipIf(!canAuthenticate)("valide le garde API table/rpc", async () => {
    const ctx = await seed();

    const deniedFlag = await withSession(
      {
        role: "authenticated",
        claims: {
          sub: ctx.userA,
          role: "authenticated",
          session_id: `sess_${ctx.userA.slice(0, 8)}`,
          firm_id: ctx.firmB,
        },
      },
      async (client) => {
        const { rows } = await client.query<{ allowed: boolean }>(
          "select app_private.can_access_api_target($1, $2) as allowed",
          ["table", "public.matters"],
        );
        return Boolean(rows[0]?.allowed);
      },
    );
    expect(deniedFlag).toBe(false);

    const allowedFlag = await withSession(
      {
        role: "authenticated",
        claims: {
          sub: ctx.userA,
          role: "authenticated",
          session_id: `sess_${ctx.userA.slice(0, 8)}`,
          firm_id: ctx.firmA,
        },
      },
      async (client) => {
        const { rows } = await client.query<{ allowed: boolean }>(
          "select app_private.can_access_api_target($1, $2) as allowed",
          ["table", "public.matters"],
        );
        return Boolean(rows[0]?.allowed);
      },
    );
    expect(allowedFlag).toBe(true);
  });

  it.skipIf(!canAuthenticate)("n'autorise la gestion detail entreprise que pour l'entreprise autorisee", async () => {
    const ctx = await seed();
    const service = createServerClient(SERVICE_CONTEXT);

    const { data: membershipA } = await service
      .from("enterprise_memberships")
      .select("id")
      .eq("user_id", ctx.userA)
      .eq("firm_id", ctx.firmA)
      .single();

    let { data: managerGrade } = await service
      .from("enterprise_grades")
      .select("id")
      .eq("firm_id", ctx.firmA)
      .eq("code", "manager")
      .maybeSingle();

    if (!managerGrade?.id) {
      const { data: createdManager, error: managerErr } = await service
        .from("enterprise_grades")
        .insert({ firm_id: ctx.firmA, code: `manager_${Date.now()}`, name: "Manager Temp", is_system: false } as never)
        .select("id")
        .single();
      expect(managerErr).toBeNull();
      managerGrade = createdManager;

      await service
        .from("enterprise_grade_permissions")
        .insert({ grade_id: managerGrade!.id, permission_key: "enterprise.manage" } as never);
    }

    await service.from("enterprise_member_grades").upsert({
      membership_id: membershipA!.id,
      grade_id: managerGrade!.id,
    } as never);

    const allowedManageFlag = await withSession(
      {
        role: "authenticated",
        claims: {
          sub: ctx.userA,
          role: "authenticated",
          session_id: `sess_${ctx.userA.slice(0, 8)}`,
          firm_id: ctx.firmA,
        },
      },
      async (client) => {
        const { rows } = await client.query<{ allowed: boolean }>(
          "select app_private.can_manage_enterprise($1, $2) as allowed",
          [ctx.firmA, ctx.userA],
        );
        return Boolean(rows[0]?.allowed);
      },
    );
    expect(allowedManageFlag).toBe(true);

    const deniedManageFlag = await withSession(
      {
        role: "authenticated",
        claims: {
          sub: ctx.userB,
          role: "authenticated",
          session_id: `sess_${ctx.userB.slice(0, 8)}`,
          firm_id: ctx.firmB,
        },
      },
      async (client) => {
        const { rows } = await client.query<{ allowed: boolean }>(
          "select app_private.can_manage_enterprise($1, $2) as allowed",
          [ctx.firmA, ctx.userB],
        );
        return Boolean(rows[0]?.allowed);
      },
    );
    expect(deniedManageFlag).toBe(false);
  });

  it.skipIf(!canAuthenticate)("supporte creation/modification/suppression de grades independants par entreprise", async () => {
    const ctx = await seed();
    const service = createServerClient(SERVICE_CONTEXT);

    const sameCode = `shared_${Date.now()}`;
    const { data: gradeA, error: errA } = await service
      .from("enterprise_grades")
      .insert({ firm_id: ctx.firmA, code: sameCode, name: "Grade A", is_system: false } as never)
      .select("id, code, name, firm_id")
      .single();
    expect(errA).toBeNull();

    const { data: gradeB, error: errB } = await service
      .from("enterprise_grades")
      .insert({ firm_id: ctx.firmB, code: sameCode, name: "Grade B", is_system: false } as never)
      .select("id, code, name, firm_id")
      .single();
    expect(errB).toBeNull();

    expect(gradeA?.code).toBe(gradeB?.code);
    expect(gradeA?.firm_id).not.toBe(gradeB?.firm_id);

    const { error: updateErr } = await service
      .from("enterprise_grades")
      .update({ name: "Grade A - Updated" } as never)
      .eq("id", gradeA!.id);
    expect(updateErr).toBeNull();

    const { data: updatedA } = await service
      .from("enterprise_grades")
      .select("name")
      .eq("id", gradeA!.id)
      .single();
    const { data: unchangedB } = await service
      .from("enterprise_grades")
      .select("name")
      .eq("id", gradeB!.id)
      .single();

    expect(updatedA?.name).toBe("Grade A - Updated");
    expect(unchangedB?.name).toBe("Grade B");

    const { error: delErr } = await service
      .from("enterprise_grades")
      .delete()
      .eq("id", gradeA!.id);
    expect(delErr).toBeNull();

    const { data: stillB } = await service
      .from("enterprise_grades")
      .select("id")
      .eq("id", gradeB!.id)
      .maybeSingle();
    expect(stillB?.id).toBe(gradeB?.id);
  });

  it.skipIf(!canAuthenticate)("active automatiquement le profil Avocat et conserve l'historique au retrait", async () => {
    const ctx = await seed();
    const service = createServerClient(SERVICE_CONTEXT);

    const { data: membershipA } = await service
      .from("enterprise_memberships")
      .select("id")
      .eq("user_id", ctx.userA)
      .eq("firm_id", ctx.firmA)
      .single();
    expect(membershipA?.id).toBeTruthy();

    const lawyerCode = `lawyer_auto_${Date.now()}`;
    const supportCode = `support_auto_${Date.now()}`;

    const { data: lawyerGrade, error: lawyerGradeErr } = await service
      .from("enterprise_grades")
      .insert({ firm_id: ctx.firmA, code: lawyerCode, name: "Avocat", is_system: false } as never)
      .select("id")
      .single();
    expect(lawyerGradeErr).toBeNull();

    const { data: supportGrade, error: supportGradeErr } = await service
      .from("enterprise_grades")
      .insert({ firm_id: ctx.firmA, code: supportCode, name: "Support", is_system: false } as never)
      .select("id")
      .single();
    expect(supportGradeErr).toBeNull();

    await service.from("enterprise_grade_modules").upsert([
      { grade_id: supportGrade!.id, module_slug: "matters", allowed: true },
      { grade_id: supportGrade!.id, module_slug: "clients", allowed: true },
    ] as never);

    const { error: insSupportErr } = await service
      .from("enterprise_member_grades")
      .insert({ membership_id: membershipA!.id, grade_id: supportGrade!.id } as never);
    expect(insSupportErr).toBeNull();

    const { error: insLawyerErr } = await service
      .from("enterprise_member_grades")
      .insert({ membership_id: membershipA!.id, grade_id: lawyerGrade!.id } as never);
    expect(insLawyerErr).toBeNull();

    const { data: lawyerRow, error: lawyerErr } = await service
      .from("lawyers")
      .select("id, profile_id, firm_id, first_name, last_name")
      .eq("profile_id", ctx.userA)
      .eq("firm_id", ctx.firmA)
      .maybeSingle();
    expect(lawyerErr).toBeNull();
    expect(lawyerRow?.id).toBeTruthy();

    const { data: avocatRole } = await service
      .from("user_roles")
      .select("id")
      .eq("user_id", ctx.userA)
      .eq("role", "avocat")
      .maybeSingle();
    expect(avocatRole?.id).toBeTruthy();

    const allowedBeforeRemoval = await userClient(ctx.userA, ctx.firmA)
      .from("matters")
      .select("id")
      .limit(1);
    expect(allowedBeforeRemoval.error).toBeNull();

    const { error: removeLawyerGradeErr } = await service
      .from("enterprise_member_grades")
      .delete()
      .eq("membership_id", membershipA!.id)
      .eq("grade_id", lawyerGrade!.id);
    expect(removeLawyerGradeErr).toBeNull();

    const allowedAfterRemoval = await userClient(ctx.userA, ctx.firmA)
      .from("matters")
      .select("id")
      .limit(1);
    expect(allowedAfterRemoval.error).toBeNull();

    const { data: avocatRoleAfter } = await service
      .from("user_roles")
      .select("id")
      .eq("user_id", ctx.userA)
      .eq("role", "avocat")
      .maybeSingle();
    expect(avocatRoleAfter).toBeNull();

    const { data: lawyerStillThere } = await service
      .from("lawyers")
      .select("id")
      .eq("id", lawyerRow!.id)
      .maybeSingle();
    expect(lawyerStillThere?.id).toBe(lawyerRow?.id);
  });
});

afterAll(async () => {
  if (!canAuthenticate) return;

  await withSession(SERVICE_CONTEXT, async (client) => {
    if (createdMatterIds.length > 0) {
      await client.query("delete from public.matters where id = any($1::uuid[])", [createdMatterIds]);
    }
    if (createdUserIds.length > 0) {
      await client.query("delete from public.lawyers where profile_id = any($1::uuid[])", [createdUserIds]);
    }
    if (createdFirmIds.length > 0) {
      await client.query("delete from public.firms where id = any($1::uuid[])", [createdFirmIds]);
    }
  });

  for (const userId of createdUserIds.splice(0)) {
    await adminDeleteUser(userId);
  }
});

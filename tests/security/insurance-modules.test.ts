import { afterAll, describe, expect, it } from "vitest";

import { adminCreateUser, adminDeleteUser } from "@/backend/auth/service";
import { SERVICE_CONTEXT, withSession } from "@/backend/db/execute";
import { createServerClient } from "@/integrations/supabase/client.server";
import { canAuthenticate } from "./helpers";

const userIds: string[] = [];
const firmIds: string[] = [];

function authenticated(userId: string, firmId: string) {
  return createServerClient({
    role: "authenticated",
    claims: { sub: userId, role: "authenticated", session_id: `sess_${userId.slice(0, 8)}`, firm_id: firmId },
  });
}

async function seed() {
  const service = createServerClient(SERVICE_CONTEXT);
  const clientUser = await adminCreateUser({
    email: `insurance-client-${crypto.randomUUID()}@example.com`,
    password: "TestPass!2026",
    email_confirm: true,
  });
  const staffUser = await adminCreateUser({
    email: `insurance-staff-${crypto.randomUUID()}@example.com`,
    password: "TestPass!2026",
    email_confirm: true,
  });
  const outsiderUser = await adminCreateUser({
    email: `insurance-outsider-${crypto.randomUUID()}@example.com`,
    password: "TestPass!2026",
    email_confirm: true,
  });
  userIds.push(clientUser.id, staffUser.id, outsiderUser.id);

  const { data: firms, error } = await service
    .from("firms")
    .insert([
      { number: `INS-A-${Date.now()}`, name: "Insurance A", status: "active" },
      { number: `INS-B-${Date.now()}`, name: "Insurance B", status: "active" },
    ] as never)
    .select("id");
  if (error || !firms?.[0]?.id || !firms?.[1]?.id) throw error ?? new Error("Failed to seed firms");
  const [firmA, firmB] = firms;
  firmIds.push(firmA.id, firmB.id);

  await service.from("enterprise_modules").upsert([
    { firm_id: firmA.id, module_slug: "claims", enabled: true },
    { firm_id: firmA.id, module_slug: "refunds", enabled: true },
    { firm_id: firmB.id, module_slug: "claims", enabled: false },
    { firm_id: firmB.id, module_slug: "refunds", enabled: false },
  ] as never);

  const { data: claimGrade } = await service
    .from("enterprise_grades")
    .insert({ firm_id: firmA.id, code: `claims_${Date.now()}`, name: "Claims Manager", is_system: false } as never)
    .select("id")
    .single();
  const { data: refundGrade } = await service
    .from("enterprise_grades")
    .insert({ firm_id: firmA.id, code: `refunds_${Date.now()}`, name: "Refund Manager", is_system: false } as never)
    .select("id")
    .single();

  if (claimGrade?.id) {
    await service.from("enterprise_grade_modules").upsert([
      { grade_id: claimGrade.id, module_slug: "claims", allowed: true },
      { grade_id: claimGrade.id, module_slug: "refunds", allowed: true },
    ] as never);
  }
  if (refundGrade?.id) {
    await service.from("enterprise_grade_modules").upsert([
      { grade_id: refundGrade.id, module_slug: "claims", allowed: true },
      { grade_id: refundGrade.id, module_slug: "refunds", allowed: true },
    ] as never);
  }

  const { data: clientMembership } = await service
    .from("enterprise_memberships")
    .insert({ user_id: clientUser.id, firm_id: firmA.id, status: "active", is_default: true } as never)
    .select("id")
    .single();
  const { data: staffMembership } = await service
    .from("enterprise_memberships")
    .insert({ user_id: staffUser.id, firm_id: firmA.id, status: "active", is_default: true } as never)
    .select("id")
    .single();

  if (clientMembership?.id && claimGrade?.id) {
    await service.from("enterprise_member_grades").insert({ membership_id: clientMembership.id, grade_id: claimGrade.id } as never);
  }
  if (staffMembership?.id && refundGrade?.id) {
    await service.from("enterprise_member_grades").insert({ membership_id: staffMembership.id, grade_id: refundGrade.id } as never);
  }

  await service.from("user_roles").insert({ user_id: clientUser.id, role: "client" } as never);

  await service.from("profiles").upsert([
    { id: clientUser.id, full_name: "Insurance Client", active_firm_id: firmA.id },
    { id: staffUser.id, full_name: "Insurance Staff", active_firm_id: firmA.id },
    { id: outsiderUser.id, full_name: "Insurance Outsider", active_firm_id: firmB.id },
  ] as never);

  const { data: clientRow, error: clientRowError } = await service
    .from("clients")
    .insert({ owner_id: staffUser.id, firm_id: firmA.id, profile_id: clientUser.id, first_name: "Jean", last_name: "Client" } as never)
    .select("id")
    .single();
  if (clientRowError || !clientRow?.id) throw clientRowError ?? new Error("Failed to seed client row");

  return {
    clientUser: clientUser.id,
    staffUser: staffUser.id,
    outsiderUser: outsiderUser.id,
    firmA: firmA.id,
    firmB: firmB.id,
    clientRow: clientRow.id,
  };
}

async function debugAccess(userId: string, firmId: string, clientRowId: string) {
  return withSession(
    { role: "authenticated", claims: { sub: userId, role: "authenticated", session_id: `sess_${userId.slice(0, 8)}`, firm_id: firmId } },
    async (client) => {
      const { rows } = await client.query<{
        uid: string | null;
        is_client: boolean;
        firm_allowed: boolean;
        record_allowed: boolean;
      }>(
        "select auth.uid() as uid, app_private.has_role(auth.uid(), 'client') as is_client, app_private.can_access_firm_module(auth.uid(), $1, 'claims') as firm_allowed, app_private.can_access_client_module_record(auth.uid(), $1, $2, 'claims') as record_allowed",
        [firmId, clientRowId],
      );
      return rows[0];
    },
  );
}

describe("insurance modules", () => {
  it.skipIf(!canAuthenticate)("allows firm A and blocks firm B", async () => {
    const ctx = await seed();

    const clientA = authenticated(ctx.clientUser, ctx.firmA);
    const access = await debugAccess(ctx.clientUser, ctx.firmA, ctx.clientRow);
    expect(access).toEqual(
      expect.objectContaining({
        uid: ctx.clientUser,
        is_client: true,
        firm_allowed: true,
        record_allowed: true,
      }),
    );
    const claimInsert = await clientA.from("insurance_claims").insert({
      firm_id: ctx.firmA,
      client_id: ctx.clientRow,
      subject: "Bris de vitre",
      description: "Vitre cassee apres un incident.",
      created_by: ctx.clientUser,
    } as never).select("id, number").single();
    expect(claimInsert.error).toBeNull();
    expect(claimInsert.data?.id).toBeTruthy();

    const refundInsert = await clientA.from("refund_requests").insert({
      firm_id: ctx.firmA,
      client_id: ctx.clientRow,
      subject: "Remboursement taxi",
      description: "Justificatifs joints.",
      amount: 42,
      created_by: ctx.clientUser,
    } as never).select("id, number").single();
    expect(refundInsert.error).toBeNull();
    expect(refundInsert.data?.id).toBeTruthy();

    const claimRead = await clientA.from("insurance_claims").select("id, number");
    const refundRead = await clientA.from("refund_requests").select("id, number");
    expect(claimRead.error).toBeNull();
    expect(refundRead.error).toBeNull();
    expect((claimRead.data ?? []).length).toBe(1);
    expect((refundRead.data ?? []).length).toBe(1);

    const clientB = authenticated(ctx.outsiderUser, ctx.firmB);
    const deniedClaims = await clientB.from("insurance_claims").select("id");
    const deniedRefunds = await clientB.from("refund_requests").select("id");
    expect(deniedClaims.error).not.toBeNull();
    expect(deniedRefunds.error).not.toBeNull();
    expect(deniedClaims.error?.code).toBe("42501");
    expect(deniedRefunds.error?.code).toBe("42501");
  });
});

afterAll(async () => {
  if (!canAuthenticate) return;
  await createServerClient(SERVICE_CONTEXT)
    .from("firms")
    .delete()
    .in("id", firmIds);
  for (const userId of userIds.splice(0)) await adminDeleteUser(userId);
});
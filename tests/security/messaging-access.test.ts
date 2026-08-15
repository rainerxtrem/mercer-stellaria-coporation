import { afterAll, describe, expect, it } from "vitest";

import { adminCreateUser, adminDeleteUser } from "@/backend/auth/service";
import { SERVICE_CONTEXT, withSession } from "@/backend/db/execute";
import { createServerClient } from "@/integrations/supabase/client.server";
import { canAuthenticate } from "./helpers";

const userIds: string[] = [];
const firmIds: string[] = [];

type Context = Awaited<ReturnType<typeof seed>>;

function authenticated(userId: string, firmId: string) {
  return createServerClient({
    role: "authenticated",
    claims: { sub: userId, role: "authenticated", firm_id: firmId },
  });
}

async function seed() {
  const service = createServerClient(SERVICE_CONTEXT);
  const users = await Promise.all(
    ["staff", "admin", "client", "outsider"].map((label) =>
      adminCreateUser({
        email: `messaging-${label}-${crypto.randomUUID()}@example.com`,
        password: "TestPass!2026",
        email_confirm: true,
      }),
    ),
  );
  userIds.push(...users.map((user) => user.id));
  const [staff, admin, clientUser, outsider] = users;

  const { data: firms, error: firmError } = await service
    .from("firms")
    .insert([
      { number: `MSG-A-${Date.now()}`, name: "Messaging A", status: "active" },
      { number: `MSG-B-${Date.now()}`, name: "Messaging B", status: "active" },
    ] as never)
    .select("id");
  if (firmError || !firms?.[0]?.id || !firms[1]?.id)
    throw firmError ?? new Error("Firm seed failed");
  const [firmA, firmB] = firms;
  firmIds.push(firmA.id, firmB.id);

  await service.from("enterprise_memberships").insert([
    { user_id: staff.id, firm_id: firmA.id, status: "active", is_default: true },
    { user_id: clientUser.id, firm_id: firmA.id, status: "active", is_default: true },
  ] as never);
  const { error: roleError } = await service.from("user_roles").insert([
    { user_id: admin.id, role: "batonnier" },
    { user_id: clientUser.id, role: "client" },
  ] as never);
  if (roleError) throw roleError;
  await service.from("profiles").upsert([
    { id: staff.id, full_name: "Messaging Staff", active_firm_id: firmA.id },
    { id: admin.id, full_name: "Messaging Admin", active_firm_id: firmA.id },
    { id: clientUser.id, full_name: "Messaging Client", active_firm_id: firmA.id },
    { id: outsider.id, full_name: "Messaging Outsider", active_firm_id: firmA.id },
  ] as never);

  const { data: clients, error: clientError } = await service
    .from("clients")
    .insert([
      {
        owner_id: staff.id,
        firm_id: firmA.id,
        profile_id: clientUser.id,
        first_name: "Alice",
        last_name: "A",
      },
      { owner_id: admin.id, firm_id: firmA.id, first_name: "Alex", last_name: "A" },
    ] as never)
    .select("id, firm_id");
  if (clientError || !clients?.[0]?.id) throw clientError ?? new Error("Client seed failed");

  const clientA = clients[0];
  const { data: matter, error: matterError } = await service
    .from("matters")
    .insert({
      owner_id: staff.id,
      firm_id: firmA.id,
      client_id: clientA.id,
      number: "",
      title: "Matter A",
      status: "open",
    } as never)
    .select("id")
    .single();
  if (matterError || !matter?.id) throw matterError ?? new Error("Matter seed failed");

  const { data: conversation, error: conversationError } = await service
    .from("client_conversations")
    .insert({ client_id: clientA.id, firm_id: firmA.id, created_by: clientUser.id } as never)
    .select("id")
    .single();
  if (conversationError || !conversation?.id)
    throw conversationError ?? new Error("Conversation seed failed");

  await service.from("client_conversation_messages").insert({
    conversation_id: conversation.id,
    author_id: clientUser.id,
    body: "General A",
  } as never);
  await service.from("matter_messages").insert({
    matter_id: matter.id,
    author_id: staff.id,
    body: "Matter A",
    internal: false,
  } as never);

  return {
    staff: staff.id,
    admin: admin.id,
    clientUser: clientUser.id,
    outsider: outsider.id,
    firmA: firmA.id,
    firmB: firmB.id,
    clientA: clientA.id,
    conversation: conversation.id,
    matter: matter.id,
  };
}

async function apiAllowed(userId: string, firmId: string, table: string) {
  return withSession(
    { role: "authenticated", claims: { sub: userId, role: "authenticated", firm_id: firmId } },
    async (client) => {
      const { rows } = await client.query<{ allowed: boolean }>(
        "select app_private.can_access_api_target('table', $1) as allowed",
        [table],
      );
      return Boolean(rows[0]?.allowed);
    },
  );
}

async function adminAccessState(userId: string, firmId: string) {
  return withSession(
    { role: "authenticated", claims: { sub: userId, role: "authenticated", firm_id: firmId } },
    async (client) => {
      const { rows } = await client.query<{
        is_admin: boolean;
        active_firm_id: string | null;
        enterprise_allowed: boolean;
        staff_allowed: boolean;
        allowed: boolean;
      }>(
        "select app_private.has_role(auth.uid(), 'batonnier') as is_admin, app_private.user_active_firm_id(auth.uid()) as active_firm_id, app_private.can_access_enterprise_messaging(auth.uid(), app_private.user_active_firm_id(auth.uid())) as enterprise_allowed, app_private.can_access_staff_messaging(auth.uid(), app_private.user_active_firm_id(auth.uid())) as staff_allowed, app_private.can_access_api_target('table', 'public.client_conversations') as allowed",
      );
      return rows[0];
    },
  );
}

describe("enterprise messaging access", () => {
  let context: Context;

  it.skipIf(!canAuthenticate)(
    "allows admin selection and staff messaging without module grants",
    async () => {
      context = await seed();

      expect(await apiAllowed(context.staff, context.firmA, "public.client_conversations")).toBe(
        true,
      );
      expect(await adminAccessState(context.admin, context.firmA)).toEqual({
        is_admin: true,
        active_firm_id: context.firmA,
        enterprise_allowed: true,
        staff_allowed: true,
        allowed: true,
      });

      const staff = authenticated(context.staff, context.firmA);
      const conversations = await staff.from("client_conversations").select("id");
      const clients = await staff.from("clients").select("id, firm_id");
      const matterMessages = await staff.from("matter_messages").select("id, matter_id");

      expect(conversations.error).toBeNull();
      expect(conversations.data?.map((row) => row.id)).toContain(context.conversation);
      expect(clients.data?.map((row) => row.id)).toContain(context.clientA);
      expect(clients.data?.some((row) => row.id === context.clientA)).toBe(true);
      expect(matterMessages.data?.some((row) => row.matter_id === context.matter)).toBe(true);

      const admin = authenticated(context.admin, context.firmA);
      const adminConversations = await admin.from("client_conversations").select("id");
      expect(adminConversations.data?.map((row) => row.id)).toContain(context.conversation);
    },
  );

  it.skipIf(!canAuthenticate)(
    "keeps clients on their records and rejects cross-firm or no-membership access",
    async () => {
      if (!context) context = await seed();

      const client = authenticated(context.clientUser, context.firmA);
      const ownConversations = await client.from("client_conversations").select("id");
      expect(ownConversations.data?.map((row) => row.id)).toEqual([context.conversation]);

      const wrongFirm = authenticated(context.staff, context.firmB);
      const crossFirm = await wrongFirm.from("client_conversations").select("id");
      const sharedClients = await wrongFirm.from("clients").select("id");
      expect(crossFirm.data ?? []).toHaveLength(0);
      expect(crossFirm.error?.code).toBe("42501");
      expect(sharedClients.data?.map((row) => row.id)).toContain(context.clientA);
      expect(await apiAllowed(context.outsider, context.firmA, "public.client_conversations")).toBe(
        false,
      );
    },
  );
});

afterAll(async () => {
  if (!canAuthenticate) return;
  await withSession(SERVICE_CONTEXT, async (client) => {
    if (firmIds.length > 0) {
      await client.query("delete from public.matters where firm_id = any($1::uuid[])", [firmIds]);
      await client.query("delete from public.firms where id = any($1::uuid[])", [firmIds]);
    }
  });
  for (const userId of userIds.splice(0)) await adminDeleteUser(userId);
});

import { afterAll, describe, expect, it } from "vitest";

import { adminCreateUser, adminDeleteUser } from "@/backend/auth/service";
import { SERVICE_CONTEXT } from "@/backend/db/execute";
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

  const userA = await adminCreateUser({
    email: `tpl-a-${crypto.randomUUID()}@example.com`,
    password: "TestPass!2026",
    email_confirm: true,
  });
  const userB = await adminCreateUser({
    email: `tpl-b-${crypto.randomUUID()}@example.com`,
    password: "TestPass!2026",
    email_confirm: true,
  });
  userIds.push(userA.id, userB.id);

  const { data: firms, error: firmError } = await service
    .from("firms")
    .insert([
      { number: `TPL-A-${Date.now()}`, name: "Templates A", status: "active" },
      { number: `TPL-B-${Date.now()}`, name: "Templates B", status: "active" },
    ] as never)
    .select("id");
  if (firmError || !firms?.[0]?.id || !firms?.[1]?.id) throw firmError ?? new Error("Failed to seed firms");
  const [firmA, firmB] = firms;
  firmIds.push(firmA.id, firmB.id);

  await service.from("enterprise_modules").upsert([
    { firm_id: firmA.id, module_slug: "document_generator", enabled: true },
    { firm_id: firmB.id, module_slug: "document_generator", enabled: true },
    { firm_id: firmA.id, module_slug: "signature", enabled: true },
  ] as never);

  const { data: gradeA } = await service
    .from("enterprise_grades")
    .insert({ firm_id: firmA.id, code: `tpl_${Date.now()}_a`, name: "Tpl A", is_system: false } as never)
    .select("id")
    .single();
  const { data: gradeB } = await service
    .from("enterprise_grades")
    .insert({ firm_id: firmB.id, code: `tpl_${Date.now()}_b`, name: "Tpl B", is_system: false } as never)
    .select("id")
    .single();
  if (!gradeA?.id || !gradeB?.id) throw new Error("Failed to seed grades");

  await service.from("enterprise_grade_modules").upsert([
    { grade_id: gradeA.id, module_slug: "document_generator", allowed: true },
    { grade_id: gradeB.id, module_slug: "document_generator", allowed: true },
    { grade_id: gradeA.id, module_slug: "signature", allowed: true },
  ] as never);

  const { data: membershipA } = await service
    .from("enterprise_memberships")
    .insert({ user_id: userA.id, firm_id: firmA.id, status: "active", is_default: true } as never)
    .select("id")
    .single();
  const { data: membershipB } = await service
    .from("enterprise_memberships")
    .insert({ user_id: userB.id, firm_id: firmB.id, status: "active", is_default: true } as never)
    .select("id")
    .single();
  if (!membershipA?.id || !membershipB?.id) throw new Error("Failed to seed memberships");

  await service.from("enterprise_member_grades").insert([
    { membership_id: membershipA.id, grade_id: gradeA.id },
    { membership_id: membershipB.id, grade_id: gradeB.id },
  ] as never);

  await service.from("profiles").upsert([
    { id: userA.id, full_name: "Template A", active_firm_id: firmA.id },
    { id: userB.id, full_name: "Template B", active_firm_id: firmB.id },
  ] as never);

  return {
    userA: userA.id,
    userB: userB.id,
    firmA: firmA.id,
    firmB: firmB.id,
  };
}

describe("doc templates backend and signature json persistence", () => {
  it.skipIf(!canAuthenticate)("enforces enterprise isolation for template creation and reads", async () => {
    const ctx = await seed();
    const userAClient = authenticated(ctx.userA, ctx.firmA);

    const created = await userAClient
      .from("doc_templates")
      .insert({
        firm_id: ctx.firmA,
        name: "Convention honoraires",
        description: "Modele DOCX",
        kind: "docx",
        created_by: ctx.userA,
        updated_by: ctx.userA,
      } as never)
      .select("id, firm_id")
      .single();

    expect(created.error).toBeNull();
    expect(created.data?.firm_id).toBe(ctx.firmA);

    const createdTemplateId = String(created.data?.id ?? "");
    const version = await userAClient.from("doc_template_versions").insert({
      template_id: createdTemplateId,
      version: 1,
      storage_path: `${ctx.firmA}/sample.docx`,
      file_name: "sample.docx",
      mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size_bytes: 1024,
      fields: [{ key: "client_name", label: "Client" }],
      created_by: ctx.userA,
    } as never);
    expect(version.error).toBeNull();

    const createdPdf = await userAClient
      .from("doc_templates")
      .insert({
        firm_id: ctx.firmA,
        name: "Attestation PDF",
        description: "Modele PDF",
        kind: "pdf",
        created_by: ctx.userA,
        updated_by: ctx.userA,
      } as never)
      .select("id, firm_id")
      .single();
    expect(createdPdf.error).toBeNull();
    const createdPdfId = String(createdPdf.data?.id ?? "");
    const pdfVersion = await userAClient.from("doc_template_versions").insert({
      template_id: createdPdfId,
      version: 1,
      storage_path: `${ctx.firmA}/sample.pdf`,
      file_name: "sample.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      fields: [{ key: "matter_number", label: "Dossier" }],
      created_by: ctx.userA,
    } as never);
    expect(pdfVersion.error).toBeNull();

    const userBClient = authenticated(ctx.userB, ctx.firmB);
    const deniedInsert = await userBClient
      .from("doc_templates")
      .insert({
        firm_id: ctx.firmA,
        name: "Tentative cross firm",
        kind: "pdf",
        created_by: ctx.userB,
        updated_by: ctx.userB,
      } as never);
    expect(deniedInsert.error).not.toBeNull();
    expect(deniedInsert.error?.code).toBe("42501");

    const hidden = await userBClient.from("doc_templates").select("id").eq("id", createdTemplateId);
    expect(hidden.error).toBeNull();
    expect(hidden.data ?? []).toHaveLength(0);
  });

  it.skipIf(!canAuthenticate)("stores signature placements json for drawn and generated methods", async () => {
    const ctx = await seed();
    const service = createServerClient(SERVICE_CONTEXT);

    const { data: clientRow } = await service
      .from("clients")
      .insert({ owner_id: ctx.userA, firm_id: ctx.firmA, first_name: "Client", last_name: "Signature" } as never)
      .select("id")
      .single();
    expect(clientRow?.id).toBeTruthy();

    const { data: matter } = await service
      .from("matters")
      .insert({ owner_id: ctx.userA, firm_id: ctx.firmA, client_id: clientRow!.id, title: "Dossier signature", status: "open", number: "" } as never)
      .select("id")
      .single();
    expect(matter?.id).toBeTruthy();

    const { data: invoice } = await service
      .from("invoices")
      .insert({
        kind: "invoice",
        owner_id: ctx.userA,
        firm_id: ctx.firmA,
        matter_id: matter!.id,
        client_id: clientRow!.id,
        status: "sent",
        currency: "EUR",
        subtotal: 100,
        tax_rate: 0,
        tax_amount: 0,
        total: 100,
        number: `FAC-TST-${Date.now()}`,
        client_snapshot: {},
        owner_snapshot: {},
      } as never)
      .select("id")
      .single();
    expect(invoice?.id).toBeTruthy();

    const placements = [{ page: 1, x: 20, y: 30, width: 180, height: 70 }];

    for (const method of ["drawn", "generated"] as const) {
      const { data: link } = await service
        .from("signature_links")
        .insert({
          invoice_id: invoice!.id,
          token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
          created_by: ctx.userA,
          active: true,
        } as never)
        .select("id")
        .single();

      const inserted = await service.from("document_signatures").insert({
        link_id: link!.id,
        invoice_id: invoice!.id,
        signature_uid: `SIG-${method}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        first_name: "Jean",
        last_name: "Dupont",
        method,
        style: method === "generated" ? "dancing" : null,
        placements,
        ip_address: "127.0.0.1",
        user_agent: "vitest",
        storage_path: `signatures/${invoice!.id}/${method}.pdf`,
      } as never).select("id, method, placements").single();

      expect(inserted.error).toBeNull();
      expect(inserted.data?.method).toBe(method);
      expect(Array.isArray((inserted.data as any)?.placements)).toBe(true);
      expect(((inserted.data as any)?.placements ?? [])[0]?.page).toBe(1);

      const pdfPath = `signatures/${invoice!.id}/${method}-signed.pdf`;
      const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
      const uploaded = await service.storage
        .from("bar-media")
        .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true } as any);
      expect(uploaded.error).toBeNull();

      const matterDocInsert = await service.from("matter_documents").insert({
        matter_id: matter!.id,
        filename: `${method}-signed.pdf`,
        storage_path: pdfPath,
        mime_type: "application/pdf",
        size_bytes: pdfBytes.length,
        tags: ["signature", "invoice"],
        uploaded_by: ctx.userA,
      } as never);
      expect(matterDocInsert.error).toBeNull();

      const matterDocs = await service
        .from("matter_documents")
        .select("id, storage_path")
        .eq("matter_id", matter!.id)
        .eq("storage_path", pdfPath);
      expect(matterDocs.error).toBeNull();
      expect((matterDocs.data ?? []).length).toBeGreaterThan(0);

      const downloaded = await service.storage.from("bar-media").download(pdfPath);
      expect(downloaded.error).toBeNull();
      expect(downloaded.data).toBeTruthy();
    }
  });
});

afterAll(async () => {
  if (!canAuthenticate) return;
  const service = createServerClient(SERVICE_CONTEXT);
  if (firmIds.length > 0) {
    await service.from("matter_documents").delete().in("uploaded_by", userIds as any);
    await service.from("matter_activity").delete().in("actor_id", userIds as any);
    await service.from("matters").delete().in("firm_id", firmIds as any);
    await service.from("clients").delete().in("firm_id", firmIds as any);
    await service.from("doc_templates").delete().in("firm_id", firmIds as any);
    await service.from("signature_links").delete().in("created_by", userIds as any);
    await service.from("invoices").delete().in("firm_id", firmIds as any);
    await service
      .from("enterprise_memberships")
      .delete()
      .in("firm_id", firmIds as any);
    await service
      .from("enterprise_grades")
      .delete()
      .in("firm_id", firmIds as any);
    await service.from("enterprise_modules").delete().in("firm_id", firmIds as any);
    await service.from("firms").delete().in("id", firmIds as any);
  }
  for (const userId of userIds.splice(0)) {
    await adminDeleteUser(userId);
  }
});

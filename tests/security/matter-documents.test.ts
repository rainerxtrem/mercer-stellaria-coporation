import { describe, it, expect, afterAll } from "vitest";
import { anonClient, newUserClient, cleanupUsers, canAuthenticate, isDenied } from "./helpers";

/**
 * Régression sécurité — dossiers, documents et stockage.
 * Vérifie l'isolation : anon n'accède à rien, et un avocat étranger au dossier
 * ne peut ni lister ni télécharger les pièces du bucket privé bar-media.
 */
describe("RLS — dossiers & documents", () => {
  it("anon ne peut pas lire matters", async () => {
    const res = await anonClient().from("matters").select("id, title").limit(5);
    expect(isDenied(res)).toBe(true);
  });

  it("anon ne peut pas lire matter_documents", async () => {
    const res = await anonClient().from("matter_documents").select("id, storage_path").limit(5);
    expect(isDenied(res)).toBe(true);
  });

  it("anon ne peut pas lire clients", async () => {
    const res = await anonClient().from("clients").select("id, email").limit(5);
    expect(isDenied(res)).toBe(true);
  });

  it("anon ne peut pas insérer un dossier", async () => {
    const { error } = await anonClient()
      .from("matters")
      .insert({ title: "Intrusion", owner_id: "00000000-0000-0000-0000-000000000000" } as never);
    expect(error).not.toBeNull();
  });

  it.skipIf(!canAuthenticate)("un utilisateur ne voit aucun document d'un autre cabinet", async () => {
    const { client } = await newUserClient();
    const res = await client.from("matter_documents").select("id, storage_path").limit(50);
    expect(res.error ? true : (res.data ?? []).length === 0).toBe(true);
  });

  it.skipIf(!canAuthenticate)("un utilisateur ne peut pas créer un dossier au nom d'un autre", async () => {
    const { client } = await newUserClient();
    const { error } = await client
      .from("matters")
      .insert({ title: "Usurpation", owner_id: "00000000-0000-0000-0000-000000000000" } as never);
    expect(error).not.toBeNull();
  });
});

describe("Storage — bucket privé bar-media", () => {
  it("anon ne peut pas lister matters/", async () => {
    const res = await anonClient().storage.from("bar-media").list("matters");
    expect(res.error || (res.data ?? []).length === 0).toBeTruthy();
  });

  it("anon ne peut pas télécharger un objet arbitraire", async () => {
    const res = await anonClient().storage.from("bar-media").download("matters/probe.pdf");
    expect(res.error).not.toBeNull();
  });

  it("anon ne peut pas signer une URL", async () => {
    const res = await anonClient().storage.from("bar-media").createSignedUrl("matters/probe.pdf", 60);
    expect(res.error).not.toBeNull();
  });

  it.skipIf(!canAuthenticate)("un utilisateur étranger ne peut pas lister les pièces d'un dossier", async () => {
    const { client } = await newUserClient();
    const res = await client.storage.from("bar-media").list("matters");
    expect(res.error || (res.data ?? []).length === 0).toBeTruthy();
  });

  it.skipIf(!canAuthenticate)("un utilisateur étranger ne peut pas uploader dans matters/", async () => {
    const { client } = await newUserClient();
    const res = await client.storage
      .from("bar-media")
      .upload(`matters/00000000-0000-0000-0000-000000000000/probe.txt`, new Blob(["x"]), {
        contentType: "text/plain",
      });
    expect(res.error).not.toBeNull();
  });

  it("les modèles de cabinet (firm-templates) sont inaccessibles à anon", async () => {
    const anon = anonClient();
    const list = await anon.storage.from("firm-templates").list("");
    expect(list.error || (list.data ?? []).length === 0).toBeTruthy();
  });

  it("la bibliothèque privée (bar-library) est inaccessible à anon", async () => {
    const res = await anonClient().storage.from("bar-library").list("");
    expect(res.error || (res.data ?? []).length === 0).toBeTruthy();
  });
});

describe("RPC — permissions", () => {
  it("has_role n'est pas appelable par anon", async () => {
    const { error } = await anonClient().rpc("has_role", {
      _user_id: "00000000-0000-0000-0000-000000000000",
      _role: "batonnier",
    });
    expect(error).not.toBeNull();
  });

  it("get_firm_stats n'est pas appelable par anon", async () => {
    const { error } = await anonClient().rpc("get_firm_stats", {
      _firm_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("les statistiques publiques restent lisibles par anon", async () => {
    const { error } = await anonClient().rpc("get_public_stats");
    expect(error).toBeNull();
  });

  it("les décisions disciplinaires publiées sont lisibles sans PII nominative", async () => {
    const { data, error } = await anonClient().rpc("get_public_disciplinary_decisions");
    expect(error).toBeNull();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      expect(Object.prototype.hasOwnProperty.call(row, "lawyer_id")).toBe(false);
      expect(String(row["lawyer_initials"] ?? "").length).toBeLessThanOrEqual(6);
    }
  });

  it("anon ne peut pas lire les réponses d'examen", async () => {
    const res = await anonClient().from("bar_exam_answers").select("id").limit(5);
    expect(isDenied(res)).toBe(true);
  });

  it("anon ne peut pas lire les bonnes réponses des formations", async () => {
    const res = await anonClient().from("training_choices").select("id, is_correct").limit(5);
    expect(isDenied(res)).toBe(true);
  });
});

afterAll(cleanupUsers);

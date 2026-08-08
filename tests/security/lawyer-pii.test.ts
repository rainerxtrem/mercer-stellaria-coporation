import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { anonClient, newUserClient, cleanupUsers, canAuthenticate, isDenied, PII_COLUMNS, DATABASE_URL } from "./helpers";

/**
 * Régression sécurité — PII avocats.
 * Vérifie que les visiteurs anonymes et les utilisateurs simplement connectés
 * ne peuvent jamais lire les colonnes sensibles de public.lawyers, et que les
 * RPC d'annuaire n'exposent que les colonnes publiques.
 */
describe("RLS — public.lawyers PII", () => {
  beforeAll(() => {
    expect(DATABASE_URL, "DATABASE_URL manquant").toBeTruthy();
  });

  it("anon ne peut pas lire les colonnes PII de lawyers", async () => {
    const supabase = anonClient();
    const res = await supabase.from("lawyers").select("id, email, phone, address");
    expect(isDenied(res)).toBe(true);
  });

  it("anon ne peut pas lire lawyers en select *", async () => {
    const supabase = anonClient();
    const res = await supabase.from("lawyers").select("*").limit(5);
    if (!res.error) {
      for (const row of res.data ?? []) {
        for (const col of PII_COLUMNS) {
          expect(row[col as keyof typeof row] ?? null, `colonne ${col} exposée`).toBeNull();
        }
      }
    }
  });

  it("le RPC annuaire public n'expose aucune PII", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.rpc("list_public_lawyers");
    expect(error).toBeNull();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      for (const col of PII_COLUMNS) {
        expect(Object.prototype.hasOwnProperty.call(row, col), `${col} présent`).toBe(false);
      }
    }
  });

  it("get_public_lawyer n'expose aucune PII", async () => {
    const supabase = anonClient();
    const { data: list } = await supabase.rpc("list_public_lawyers");
    const first = ((list ?? []) as { id: string }[])[0];
    if (!first) return; // annuaire vide : rien à vérifier
    const { data, error } = await supabase.rpc("get_public_lawyer", { _id: first.id });
    expect(error).toBeNull();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      for (const col of PII_COLUMNS) {
        expect(Object.prototype.hasOwnProperty.call(row, col), `${col} présent`).toBe(false);
      }
    }
  });

  it.skipIf(!canAuthenticate)("un utilisateur connecté sans rôle ne peut pas appeler admin_list_lawyers", async () => {
    const { client } = await newUserClient();
    const { error } = await client.rpc("admin_list_lawyers");
    expect(error).not.toBeNull();
  });

  it("anon ne peut pas appeler admin_list_lawyers", async () => {
    const { error } = await anonClient().rpc("admin_list_lawyers");
    expect(error).not.toBeNull();
  });

  it.skipIf(!canAuthenticate)("un utilisateur ne peut pas s'attribuer un rôle privilégié", async () => {
    const { client, userId } = await newUserClient();
    const { error } = await client.from("user_roles").insert({ user_id: userId, role: "batonnier" });
    expect(error).not.toBeNull();
  });

  it.skipIf(!canAuthenticate)("un utilisateur non habilité ne peut pas modifier le statut d'un avocat", async () => {
    const { client } = await newUserClient();
    const { data: list } = await anonClient().rpc("list_public_lawyers");
    const first = ((list ?? []) as { id: string }[])[0];
    if (!first) return;
    const res = await client
      .from("lawyers")
      .update({ status: "revoked" })
      .eq("id", first.id)
      .select("id");
    expect(isDenied(res)).toBe(true);
  });
});

afterAll(cleanupUsers);

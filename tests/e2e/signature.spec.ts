import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test("signature électronique d'un devis via lien sécurisé", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signUp(page);

  await page.goto("/facturation");
  await page.getByRole("button", { name: /nouveau devis/i }).click();
  await expect(page).toHaveURL(/\/facturation\/[a-f0-9-]+/, { timeout: 20_000 });

  // Génération du lien de signature
  await page.getByRole("button", { name: /générer un lien de signature/i }).click();
  await expect(page.getByText(/lien créé|lien de signature créé/i).first()).toBeVisible({ timeout: 15_000 });
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/signature\/[0-9a-f]{64}$/);

  // Le destinataire ouvre le lien dans un navigateur non authentifié
  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(url);
  await expect(gp.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

  await gp.getByLabel("Prénom").fill("Jean");
  await gp.getByLabel("Nom").fill("Dupont");
  await gp.getByRole("button", { name: /créer ma signature/i }).click();
  await gp.getByRole("tab", { name: /générer/i }).click();
  await gp.getByRole("button", { name: /utiliser cette signature/i }).click();

  // Placement de la signature sur la première page
  const pageCanvas = gp.locator("main canvas").first();
  await pageCanvas.click({ position: { x: 300, y: 600 } });

  await gp.getByRole("button", { name: /valider et signer/i }).click();
  await expect(gp.getByText(/document signé et scellé/i)).toBeVisible({ timeout: 40_000 });

  const [download] = await Promise.all([
    gp.waitForEvent("download", { timeout: 20_000 }),
    gp.getByRole("button", { name: /télécharger le pdf signé/i }).click(),
  ]);
  const fs = await import("node:fs");
  expect(fs.statSync((await download.path())!).size).toBeGreaterThan(2000);

  // Le lien est verrouillé après signature
  await gp.goto(url);
  await expect(gp.getByText(/document déjà signé/i)).toBeVisible({ timeout: 20_000 });

  // Côté avocat : signature visible et statut mis à jour
  await page.reload();
  await expect(page.getByText(/signé par jean dupont/i)).toBeVisible({ timeout: 20_000 });
  await guest.close();
});

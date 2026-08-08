import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test("créer un devis, le convertir en facture, enregistrer un paiement", async ({ page }) => {
  await signUp(page);
  await page.goto("/facturation");
  await page.getByRole("button", { name: /nouveau devis/i }).click();
  await expect(page).toHaveURL(/\/facturation\/[a-f0-9-]+/);

  // fill line 1
  const rows = page.getByRole("row");
  await rows.nth(1).getByPlaceholder(/consultation/i).fill("Consultation initiale");
  await rows.nth(1).locator('input[type="number"]').first().fill("2");
  await rows.nth(1).locator('input[type="number"]').nth(1).fill("150");

  // add second line
  await page.getByRole("button", { name: /ligne/i }).click();
  const rows2 = page.getByRole("row");
  await rows2.nth(2).getByPlaceholder(/consultation/i).fill("Rédaction");
  await rows2.nth(2).locator('input[type="number"]').first().fill("1");
  await rows2.nth(2).locator('input[type="number"]').nth(1).fill("400");

  await page.getByRole("button", { name: /^enregistrer$/i }).click();
  await expect(page.getByText(/enregistré/i).first()).toBeVisible({ timeout: 6000 });

  // send
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/envoyé/i).first()).toBeVisible();

  // convert
  await page.getByRole("button", { name: /convertir en facture/i }).click();
  await expect(page).toHaveURL(/\/facturation\/[a-f0-9-]+/, { timeout: 10_000 });

  // record partial payment
  await page.getByRole("button", { name: /paiement/i }).click();
  await page.getByLabel(/montant/i).fill("400");
  await page.getByRole("button", { name: /^enregistrer$/i }).click();
  await expect(page.getByText(/partiel/i).first()).toBeVisible({ timeout: 6000 });

  // full payment
  await page.getByRole("button", { name: /paiement/i }).click();
  await page.getByLabel(/montant/i).fill("300");
  await page.getByRole("button", { name: /^enregistrer$/i }).click();
  await expect(page.getByText(/^payé$/i).first()).toBeVisible({ timeout: 6000 });
});

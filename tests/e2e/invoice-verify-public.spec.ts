import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test("vérification publique d'une facture émise", async ({ page, browser }) => {
  await signUp(page);
  await page.goto("/facturation");
  await page.getByRole("tab", { name: /factures/i }).click();
  await page.getByRole("button", { name: /nouvelle facture/i }).click();
  await expect(page).toHaveURL(/\/facturation\/[a-f0-9-]+/);

  // save & send
  await page.getByRole("button", { name: /^enregistrer$/i }).click();
  await expect(page.getByText(/enregistré/i).first()).toBeVisible({ timeout: 6000 });
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/envoyé/i).first()).toBeVisible();

  // read the public verify URL displayed in card
  const link = await page.getByText(/\/verification\/facture\//).first().innerText();
  expect(link).toMatch(/verification\/facture\/[a-f0-9-]+/);

  // open in anonymous context
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(link);
  await expect(p2.getByText(/document authentique/i)).toBeVisible({ timeout: 10_000 });
  await expect(p2.getByText(/facture fac-/i)).toBeVisible();
  // No sensitive fields
  await expect(p2.getByText(/notes/i)).not.toBeVisible();
  await ctx2.close();
});

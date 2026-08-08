import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test("CRUD client", async ({ page }) => {
  await signUp(page);
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: /mes clients/i })).toBeVisible();

  // Create
  await page.getByRole("button", { name: /nouveau client/i }).click();
  await page.getByLabel(/prénom/i).fill("Jean");
  await page.getByLabel(/^nom \*$/i).fill("Dupont");
  await page.getByLabel(/^email$/i).fill("jean.dupont@example.com");
  await page.getByLabel(/téléphone/i).fill("0102030405");
  await page.getByRole("button", { name: /enregistrer/i }).click();
  await expect(page.getByRole("cell", { name: /DUPONT Jean/i })).toBeVisible();

  // Edit
  await page.getByRole("button", { name: /éditer/i }).first().click();
  await page.getByLabel(/téléphone/i).fill("0999999999");
  await page.getByRole("button", { name: /enregistrer/i }).click();
  await expect(page.getByRole("cell", { name: "0999999999" })).toBeVisible();

  // Delete
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /supprimer/i }).first().click();
  await expect(page.getByRole("cell", { name: /DUPONT Jean/i })).toHaveCount(0);
});

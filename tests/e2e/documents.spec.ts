import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { signUp } from "./helpers";

test("upload + téléchargement + suppression d'un document", async ({ page }) => {
  await signUp(page);
  await page.goto("/dossiers");

  await page.getByRole("button", { name: /nouveau dossier/i }).click();
  await page.getByLabel(/^titre \*$/i).fill("Dossier avec docs");
  await page.getByRole("button", { name: /^créer$/i }).click();
  await expect(page).toHaveURL(/\/dossiers\/[a-f0-9-]+/);

  // Prepare a tiny PDF file
  const pdfPath = path.join("/tmp", `e2e-${Date.now()}.pdf`);
  const minimalPdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000102 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n150\n%%EOF",
  );
  fs.writeFileSync(pdfPath, minimalPdf);

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(pdfPath);

  // Wait for document to appear in list
  await expect(page.locator("li", { hasText: /\.pdf$/ })).toBeVisible({ timeout: 15_000 });

  // Download opens new tab — just check it doesn't throw
  page.on("dialog", (d) => d.accept());
  const [popup] = await Promise.all([
    page.waitForEvent("popup").catch(() => null),
    page.getByRole("button", { name: /^télécharger$/i }).first().click(),
  ]);
  if (popup) await popup.close();

  // Delete
  await page.getByRole("button", { name: /^supprimer$/i }).last().click();
  await expect(page.locator("li", { hasText: /\.pdf$/ })).toHaveCount(0, { timeout: 10_000 });
});

test("import -> faire signer -> signer -> remplacement en place sans doublon", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signUp(page);
  await page.goto("/dossiers");

  await page.getByRole("button", { name: /nouveau dossier/i }).click();
  await page.getByLabel(/^titre \*$/i).fill("Dossier signature document");
  await page.getByRole("button", { name: /^créer$/i }).click();
  await expect(page).toHaveURL(/\/dossiers\/[a-f0-9-]+/);

  const pdfPath = path.join("/tmp", `e2e-sign-${Date.now()}.pdf`);
  const minimalPdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000102 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n150\n%%EOF",
  );
  fs.writeFileSync(pdfPath, minimalPdf);

  await page.locator('input[type="file"]').setInputFiles(pdfPath);
  await expect(page.locator("li", { hasText: /\.pdf$/ })).toBeVisible({ timeout: 15_000 });

  const originalName = (await page.locator("li .truncate.font-medium").first().textContent())?.trim() ?? "";
  expect(originalName).toMatch(/\.pdf$/i);

  await page.getByRole("button", { name: /faire signer/i }).first().click();
  await expect(page.getByText(/lien de signature créé/i).first()).toBeVisible({ timeout: 15_000 });
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/signature\/[0-9a-f]{64}$/);

  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(url);
  await expect(gp.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

  await gp.getByLabel("Prénom").fill("Alice");
  await gp.getByLabel("Nom").fill("Martin");
  await gp.getByRole("button", { name: /créer ma signature/i }).click();
  await gp.getByRole("tab", { name: /générer/i }).click();
  await gp.getByRole("button", { name: /utiliser cette signature/i }).click();
  await gp.locator("main canvas").first().click({ position: { x: 260, y: 520 } });

  await gp.getByRole("button", { name: /valider et signer/i }).click();
  await expect(gp.getByText(/document signé et scellé/i)).toBeVisible({ timeout: 40_000 });
  await guest.close();

  await page.reload();
  await expect(page.locator("li", { hasText: /\.pdf$/ })).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator("li .truncate.font-medium").first()).toHaveText(originalName);
});

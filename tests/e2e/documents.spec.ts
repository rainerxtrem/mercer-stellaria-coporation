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

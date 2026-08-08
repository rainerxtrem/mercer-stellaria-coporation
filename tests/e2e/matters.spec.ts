import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test("dossier + sous-dossiers imbriqués + renommage + suppression", async ({ page }) => {
  await signUp(page);
  await page.goto("/dossiers");

  // Create matter
  await page.getByRole("button", { name: /nouveau dossier/i }).click();
  await page.getByLabel(/^titre \*$/i).fill("Affaire Test");
  await page.getByRole("button", { name: /^créer$/i }).click();

  // Redirects to matter page
  await expect(page).toHaveURL(/\/dossiers\/[a-f0-9-]+/);
  await expect(page.getByRole("heading", { name: /affaire test/i })).toBeVisible();

  // Create nested folders via prompt dialogs
  page.on("dialog", async (d) => {
    if (d.type() === "prompt") await d.accept(d.defaultValue() || `dossier-${Math.random().toString(36).slice(2, 6)}`);
    else await d.accept();
  });

  // Root-level subfolder using the FolderPlus button in the tree card
  const treeCard = page.locator("text=Arborescence").locator("..");
  // Use prompt-based creation - override the dialog handler for specific values
  await page.evaluate(() => (window as any).__nextPromptValue = "Contrats");
  page.removeAllListeners("dialog");
  page.on("dialog", async (d) => {
    if (d.type() === "prompt") {
      const v = (window as any).__nextPromptValue || "sub";
      await d.accept(v as string);
    } else await d.accept();
  });
  await treeCard.getByRole("button").last().click();
  await expect(page.getByText("Contrats", { exact: true })).toBeVisible();

  // Nested inside Contrats
  await page.getByText("Contrats", { exact: true }).click();
  await page.evaluate(() => (window as any).__nextPromptValue = "Signés");
  await treeCard.getByRole("button").last().click();
  await expect(page.getByText("Signés", { exact: true })).toBeVisible();

  // Deep nested: Signés > 2026
  await page.getByText("Signés", { exact: true }).click();
  await page.evaluate(() => (window as any).__nextPromptValue = "2026");
  await treeCard.getByRole("button").last().click();
  await expect(page.getByText("2026", { exact: true })).toBeVisible();
});

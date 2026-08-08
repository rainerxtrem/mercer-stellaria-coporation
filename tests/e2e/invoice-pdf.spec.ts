import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test("télécharger le PDF d'un devis", async ({ page }) => {
  await signUp(page);
  await page.goto("/facturation");
  await page.getByRole("button", { name: /nouveau devis/i }).click();
  await expect(page).toHaveURL(/\/facturation\/[a-f0-9-]+/);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15_000 }),
    page.getByRole("button", { name: /^pdf$/i }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  const size = fs.statSync(path!).size;
  expect(size).toBeGreaterThan(1000);
});

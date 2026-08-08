import { test, expect, chromium } from "@playwright/test";
import { signUp, signOut } from "./helpers";

test("un autre avocat ne voit pas les dossiers d'un pair", async ({ page }) => {
  // User A creates a matter
  const userA = await signUp(page);
  await page.goto("/dossiers");
  await page.getByRole("button", { name: /nouveau dossier/i }).click();
  const title = `Confidentiel-${Math.random().toString(36).slice(2, 7)}`;
  await page.getByLabel(/^titre \*$/i).fill(title);
  await page.getByRole("button", { name: /^créer$/i }).click();
  await expect(page).toHaveURL(/\/dossiers\/[a-f0-9-]+/);

  // Sign out A, sign up B in a fresh browser context
  await signOut(page);

  const browser = await chromium.launch();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signUp(pageB);
  await pageB.goto("/dossiers");
  // User B should not see A's matter
  await expect(pageB.getByText(title)).toHaveCount(0);
  await browser.close();
});

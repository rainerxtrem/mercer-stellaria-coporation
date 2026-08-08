import { test, expect } from "@playwright/test";
import { signUp, signOut } from "./helpers";

test("inscription + connexion + déconnexion + restauration session", async ({ page, context }) => {
  const user = await signUp(page);
  await expect(page).toHaveURL(/espace-avocat|admin/);

  // Restore session by reloading
  await page.reload();
  await expect(page).not.toHaveURL(/\/auth/);

  await signOut(page);
  await expect(page).toHaveURL(/\/auth|\/$/);
  await context.close();
});

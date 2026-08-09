import { Page, expect } from "@playwright/test";

export function randomUser() {
  const id = Math.random().toString(36).slice(2, 10);
  return { email: `e2e-${id}@example.com`, password: "TestPass!2026", fullName: `Me E2E ${id}` };
}

export async function signUp(page: Page, user = randomUser()) {
  await page.goto("/auth");
  await page.getByRole("tab", { name: /inscription/i }).click();
  await page.getByLabel(/nom complet/i).fill(user.fullName);
  await page.getByLabel(/adresse e-mail/i).fill(user.email);
  await page.getByLabel(/mot de passe/i).fill(user.password);
  await page.getByRole("button", { name: /créer mon compte/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
  return user;
}

export async function signIn(page: Page, email: string, password: string) {
  if (!page.url().includes("/auth")) await page.goto("/auth");
  await page.getByRole("tab", { name: /^connexion$/i }).click().catch(() => {});
  await page.getByLabel(/adresse e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(password);
  await page.getByRole("button", { name: /^se connecter$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15_000 });
}

export async function signOut(page: Page) {
  // click account button
  await page.locator("header").getByRole("button").filter({ hasText: /@|e2e/ }).first().click().catch(() => {});
  await page.getByRole("menuitem", { name: /se déconnecter/i }).click().catch(() => {});
  await page.waitForURL(/\/auth/, { timeout: 15_000 }).catch(() => {});
}

export async function expectToast(page: Page, text: RegExp | string) {
  await expect(page.locator("li[data-sonner-toast], [data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 8_000 });
}

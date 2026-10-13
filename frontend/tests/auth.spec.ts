import { expect, test } from "@playwright/test";

const signIn = async (page: import("@playwright/test").Page, password = "password") => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
};

test("first visit shows only the login form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("wrong password shows an error and no board", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "wrong");
  await expect(page.getByText("Invalid username or password")).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("logs in, stays signed in on reload, then logs out", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.reload();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("API rejects requests after logout", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(200);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);
});

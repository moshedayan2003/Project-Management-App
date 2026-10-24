import { expect, test, type Page } from "@playwright/test";
import { registerNewUser } from "./helpers";

const uniqueName = () => `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;

const fillForm = async (page: Page, username: string, password: string, button: string) => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: button }).click();
};

const openAccount = async (page: Page) => {
  await page.getByRole("button", { name: /account settings/i }).click();
  return page.getByRole("dialog", { name: "Account" });
};

test("creates an account, which starts with one empty board and survives a reload", async ({ page }) => {
  const username = uniqueName();
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await fillForm(page, username, "password123", "Create account");

  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="card-card-"]')).toHaveCount(0);
  await expect(page.getByLabel("Board", { exact: true })).toHaveValue(/\d+/);
  await expect(page.getByLabel("Board", { exact: true }).locator("option:checked")).toHaveText("My board");
  await expect(page.getByRole("button", { name: /account settings/i })).toContainText(username);

  await page.reload();
  await expect(page.getByRole("button", { name: /account settings/i })).toContainText(username);

  await page.getByRole("button", { name: "Log out" }).click();
  await fillForm(page, username, "password123", "Sign in");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("explains why an account could not be created", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await fillForm(page, "user", "password123", "Create account");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("That username is taken");

  await fillForm(page, "Bad Name", "password123", "Create account");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("lowercase letters");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("each user sees only their own boards", async ({ page, browser }) => {
  await registerNewUser(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add a card" }).first().click();
  await page.getByPlaceholder("Card title").fill("Private card");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByText("Private card")).toBeVisible();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await fillForm(otherPage, "user", "password", "Sign in");
  await expect(otherPage.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(otherPage.getByText("Private card")).toHaveCount(0);
  await other.close();
});

test("changes the password", async ({ page }) => {
  const username = await registerNewUser(page);
  await page.goto("/");
  const dialog = await openAccount(page);
  await dialog.getByLabel("Current password").fill("wrong-password");
  await dialog.getByLabel("New password").fill("brand-new-pass");
  await dialog.getByRole("button", { name: "Change password" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Your current password is wrong.");

  await dialog.getByLabel("Current password").fill("password123");
  await dialog.getByRole("button", { name: "Change password" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Password changed.");
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Log out" }).click();
  await fillForm(page, username, "password123", "Sign in");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Invalid username or password");
  await fillForm(page, username, "brand-new-pass", "Sign in");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("deletes the account", async ({ page }) => {
  const username = await registerNewUser(page);
  await page.goto("/");
  const dialog = await openAccount(page);
  page.on("dialog", (confirm) => confirm.accept());
  await dialog.getByLabel("Password", { exact: true }).fill("password123");
  await dialog.getByRole("button", { name: "Delete account" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await fillForm(page, username, "password123", "Sign in");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Invalid username or password");
});

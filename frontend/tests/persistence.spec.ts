import { expect, test } from "@playwright/test";
import { signInWithFreshBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signInWithFreshBoard(page);
});

test("a new card survives a reload", async ({ page }) => {
  await page.goto("/");
  const column = page.getByTestId("column-col-review");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Saved card");
  await column.getByPlaceholder("Details").fill("Saved details");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText("Saved card")).toBeVisible();

  await page.reload();
  await expect(column.getByText("Saved card")).toBeVisible();
  await expect(column.getByText("Saved details")).toBeVisible();
});

test("an edited card survives a reload", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /edit align roadmap themes/i }).click();
  await card.getByLabel("Card title").fill("Edited and saved");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Edited and saved")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("card-card-1").getByText("Edited and saved")).toBeVisible();
});

test("a renamed column survives a reload", async ({ page }) => {
  await page.goto("/");
  const title = page.getByTestId("column-col-backlog").getByLabel("Column title");
  await title.fill("Ideas");
  await title.blur();
  await expect(title).toHaveValue("Ideas");

  await page.reload();
  await expect(page.getByTestId("column-col-backlog").getByLabel("Column title")).toHaveValue("Ideas");
});

test("a deleted card stays deleted after a reload", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("card-card-1")
    .getByRole("button", { name: "Delete Align roadmap themes" })
    .click();
  await expect(page.getByTestId("card-card-1")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
  await expect(page.getByTestId("card-card-1")).toHaveCount(0);
});

test("a dragged card keeps its new column and position after a reload", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  const target = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await target.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, { steps: 12 });
  await page.mouse.up();
  await expect(target.getByTestId("card-card-1")).toBeVisible();
  // Wait for the save to reach the server before reloading.
  await expect
    .poll(async () => {
      const board = await (await page.request.get("/api/board")).json();
      return board.columns.find((c: { id: string }) => c.id === "col-review").cardIds;
    })
    .toContain("card-1");

  await page.reload();
  await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog").getByTestId("card-card-1")).toHaveCount(0);
});

test("a card reordered within its column keeps the order after a reload", async ({ page }) => {
  await page.goto("/");
  const column = page.getByTestId("column-col-progress");
  const first = await column.getByTestId("card-card-4").boundingBox();
  const second = await column.getByTestId("card-card-5").boundingBox();
  if (!first || !second) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height - 5, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const board = await (await page.request.get("/api/board")).json();
      return board.columns.find((c: { id: string }) => c.id === "col-progress").cardIds;
    })
    .toEqual(["card-5", "card-4"]);

  await page.reload();
  const ids = await page
    .getByTestId("column-col-progress")
    .locator('[data-testid^="card-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
  expect(ids).toEqual(["card-card-5", "card-card-4"]);
});

test("changes survive logout and login", async ({ page }) => {
  await page.goto("/");
  const title = page.getByTestId("column-col-done").getByLabel("Column title");
  await title.fill("Shipped");
  await title.blur();
  await page.getByTestId("card-card-7").getByRole("button", { name: "Delete Ship marketing page" }).click();
  await expect(page.getByTestId("card-card-7")).toHaveCount(0);
  await expect
    .poll(async () => (await (await page.request.get("/api/board")).json()).cards["card-7"])
    .toBeUndefined();

  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByTestId("column-col-done").getByLabel("Column title")).toHaveValue("Shipped");
  await expect(page.getByTestId("card-card-7")).toHaveCount(0);
});

test("a second browser session sees the same board", async ({ page, browser }) => {
  await page.goto("/");
  const column = page.getByTestId("column-col-discovery");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Shared card");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText("Shared card")).toBeVisible();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await otherPage.getByLabel("Username").fill("user");
  await otherPage.getByLabel("Password").fill("password");
  await otherPage.getByRole("button", { name: "Sign in" }).click();
  await expect(otherPage.getByTestId("column-col-discovery").getByText("Shared card")).toBeVisible();
  await other.close();
});

test("the board cannot be loaded without signing in", async ({ browser }) => {
  const context = await browser.newContext();
  const response = await context.request.get("/api/board");
  expect(response.status()).toBe(401);
  await context.close();
});

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
  expect(response.ok()).toBe(true);
});

test("loads the kanban board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await page.goto("/");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("edits a card", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /edit align roadmap themes/i }).click();
  await card.getByLabel("Card title").fill("Edited title");
  await card.getByLabel("Card details").fill("Edited details");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Edited title")).toBeVisible();
  await expect(card.getByText("Edited details")).toBeVisible();
});

test("renames a column", async ({ page }) => {
  await page.goto("/");
  const column = page.getByTestId("column-col-backlog");
  await column.getByLabel("Column title").fill("Ideas");
  await expect(column.getByLabel("Column title")).toHaveValue("Ideas");
});

test("deletes a card", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("card-card-1")
    .getByRole("button", { name: "Delete Align roadmap themes" })
    .click();
  await expect(page.getByTestId("card-card-1")).toHaveCount(0);
});

test("does not add a card with a blank title", async ({ page }) => {
  await page.goto("/");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const before = await firstColumn.locator('[data-testid^="card-"]').count();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("   ");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.locator('[data-testid^="card-"]')).toHaveCount(before);
});

test("reorders a card within a column", async ({ page }) => {
  await page.goto("/");
  const column = page.getByTestId("column-col-backlog");
  const first = column.getByTestId("card-card-1");
  const second = column.getByTestId("card-card-2");
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  if (!a || !b) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 5, { steps: 12 });
  await page.mouse.up();
  const ids = await column.locator('[data-testid^="card-"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-testid"))
  );
  expect(ids).toEqual(["card-card-2", "card-card-1"]);
});

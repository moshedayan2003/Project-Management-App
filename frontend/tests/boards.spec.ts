import { expect, test, type Page } from "@playwright/test";
import { signInWithFreshBoard } from "./helpers";

const picker = (page: Page) => page.getByLabel("Board", { exact: true });
const selectedName = (page: Page) => picker(page).locator("option:checked");

const createBoard = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(selectedName(page)).toHaveText(name);
};

const addCard = async (page: Page, title: string) => {
  const column = page.getByTestId("column-col-backlog");
  await column.getByRole("button", { name: "Add a card" }).click();
  await column.getByPlaceholder("Card title").fill(title);
  await column.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(column.getByText(title)).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await signInWithFreshBoard(page);
  await page.goto("/");
  await expect(page.getByTestId("card-card-1")).toBeVisible();
});

test("creates a second board with its own cards", async ({ page }) => {
  await createBoard(page, "Launch plan");
  await expect(page.locator('[data-testid^="card-card-"]')).toHaveCount(0);
  await addCard(page, "Launch only card");

  await picker(page).selectOption({ label: "My board" });
  await expect(page.getByTestId("card-card-1")).toBeVisible();
  await expect(page.getByText("Launch only card")).toHaveCount(0);

  await picker(page).selectOption({ label: "Launch plan" });
  await expect(page.getByText("Launch only card")).toBeVisible();
  await expect(page.getByTestId("card-card-1")).toHaveCount(0);
});

test("a reload opens the board that was open", async ({ page }) => {
  await createBoard(page, "Keep me open");
  await addCard(page, "On the open board");
  await page.reload();
  await expect(selectedName(page)).toHaveText("Keep me open");
  await expect(page.getByText("On the open board")).toBeVisible();
});

test("renames a board", async ({ page }) => {
  await page.getByRole("button", { name: "Rename board" }).click();
  await page.getByLabel("Board name", { exact: true }).fill("Roadmap 2027");
  await page.getByRole("button", { name: "Save board name" }).click();
  await expect(selectedName(page)).toHaveText("Roadmap 2027");
  await page.reload();
  await expect(selectedName(page)).toHaveText("Roadmap 2027");
});

test("deletes a board after confirming", async ({ page }) => {
  await createBoard(page, "Short lived");
  page.once("dialog", (confirm) => confirm.dismiss());
  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(selectedName(page)).toHaveText("Short lived");

  page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(selectedName(page)).toHaveText("My board");
  await expect(picker(page).locator("option")).toHaveText(["My board"]);
  await page.reload();
  await expect(picker(page).locator("option")).toHaveText(["My board"]);
});

test("deleting the last board shows an empty state, and a new board can be made", async ({ page }) => {
  page.on("dialog", (confirm) => confirm.accept());
  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(page.getByText("No boards yet")).toBeVisible();
  await createBoard(page, "Fresh start");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("the AI works on the open board only", async ({ page }) => {
  await createBoard(page, "AI board");
  const reply = {
    message: "Added to this board.",
    operations: [{ type: "create_card", column_id: "col-review", title: "AI made this" }],
  };
  await page.getByLabel("Message").fill(`STUB:${JSON.stringify(reply)}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("column-col-review").getByText("AI made this")).toBeVisible();

  await picker(page).selectOption({ label: "My board" });
  await expect(page.getByTestId("card-card-1")).toBeVisible();
  await expect(page.getByText("AI made this")).toHaveCount(0);
  // each board has its own conversation
  await expect(page.getByText("Added to this board.")).toHaveCount(0);
});

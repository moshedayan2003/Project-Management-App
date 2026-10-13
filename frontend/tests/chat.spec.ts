import { expect, test, type Page } from "@playwright/test";
import { signInWithFreshBoard } from "./helpers";

// The server runs with AI_STUB=1: a message "STUB:{json}" makes the "model" reply with that json.
const say = async (page: Page, reply: { message: string; operations: unknown[] }) => {
  await page.getByLabel("Message").fill(`STUB:${JSON.stringify(reply)}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(reply.message, { exact: true })).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await signInWithFreshBoard(page);
  await page.goto("/");
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
});

test("the AI adds a card and the board updates without a reload", async ({ page }) => {
  await say(page, {
    message: "Added it.",
    operations: [
      { type: "create_card", column_id: "col-done", title: "From the AI", details: "stub" },
    ],
  });
  await expect(page.getByTestId("column-col-done").getByText("From the AI")).toBeVisible();
});

test("the AI edits a card", async ({ page }) => {
  await say(page, {
    message: "Edited.",
    operations: [{ type: "update_card", card_id: "card-1", title: "Edited by AI" }],
  });
  await expect(page.getByTestId("card-card-1")).toContainText("Edited by AI");
});

test("the AI moves a card", async ({ page }) => {
  await say(page, {
    message: "Moved.",
    operations: [{ type: "move_card", card_id: "card-1", column_id: "col-done" }],
  });
  await expect(page.getByTestId("column-col-done").getByTestId("card-card-1")).toBeVisible();
});

test("the AI deletes a card", async ({ page }) => {
  await say(page, {
    message: "Deleted.",
    operations: [{ type: "delete_card", card_id: "card-1" }],
  });
  await expect(page.getByTestId("card-card-1")).toHaveCount(0);
});

test("the AI renames a column", async ({ page }) => {
  await say(page, {
    message: "Renamed.",
    operations: [{ type: "rename_column", column_id: "col-review", title: "QA" }],
  });
  await expect(page.getByTestId("column-col-review").locator("input").first()).toHaveValue("QA");
});

test("AI changes persist after a reload", async ({ page }) => {
  await say(page, {
    message: "Deleted.",
    operations: [{ type: "delete_card", card_id: "card-2" }],
  });
  await page.reload();
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
  await expect(page.getByTestId("card-card-2")).toHaveCount(0);
});

test("a plain question leaves the board unchanged", async ({ page }) => {
  await page.getByLabel("Message").fill("How is it going?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Stub reply.")).toBeVisible();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(8);
});

test("an AI error is shown in the sidebar and the board is unchanged", async ({ page }) => {
  await page.getByLabel("Message").fill("please fail");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("complementary", { name: "AI assistant" }).getByRole("alert")).toContainText("could not answer");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(8);
});

test("the sidebar hides completely into the AI button and comes back", async ({ page }) => {
  const sidebar = page.getByRole("complementary", { name: "AI assistant" });
  const showButton = page.getByRole("button", { name: "Show AI assistant" });
  await expect(showButton).toBeHidden();

  await page.getByRole("button", { name: "Hide" }).click();
  await expect(sidebar).toBeHidden();
  await expect(showButton).toBeVisible();
  // The board gets the space back.
  const board = await page.getByTestId("column-col-done").boundingBox();
  expect(board!.x + board!.width).toBeGreaterThan(1000);

  await showButton.click();
  await expect(sidebar).toBeVisible();
  await expect(page.getByLabel("Message")).toBeVisible();
  await expect(showButton).toBeHidden();
});

import { expect, test } from "@playwright/test";
import { boardUrl, savedBoard, signInWithFreshBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signInWithFreshBoard(page);
  await page.goto("/");
  await expect(page.getByTestId("card-card-1")).toBeVisible();
});

test("sets priority, due date and labels, which survive a reload", async ({ page }) => {
  const card = page.getByTestId("card-card-1");
  await card.hover();
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByLabel("Priority").selectOption("high");
  await card.getByLabel("Due date").fill("2001-02-03");
  await card.getByLabel("Labels").fill("research, q1");
  await card.getByRole("button", { name: "Save" }).click();

  await expect(card.getByText("High")).toBeVisible();
  await expect(card.getByText("research")).toBeVisible();
  await expect(card.getByText("q1")).toBeVisible();
  await expect(card.getByTestId("due-date")).toHaveAttribute("title", "Overdue");

  await expect
    .poll(async () => (await savedBoard(page.request)).cards["card-1"])
    .toMatchObject({ priority: "high", due_date: "2001-02-03", labels: ["research", "q1"] });
  await page.reload();
  await expect(page.getByTestId("card-card-1").getByText("High")).toBeVisible();
  await expect(page.getByTestId("card-card-1").getByTestId("due-date")).toContainText("Feb 3, 2001");
});

test("the AI sets a priority and labels", async ({ page }) => {
  const reply = {
    message: "Marked it.",
    operations: [{ type: "update_card", card_id: "card-2", priority: "medium", labels: ["sales"] }],
  };
  await page.getByLabel("Message").fill(`STUB:${JSON.stringify(reply)}`);
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByTestId("card-card-2");
  await expect(card.getByText("Medium")).toBeVisible();
  await expect(card.getByText("sales", { exact: true })).toBeVisible();
});

test("search and the priority filter narrow the cards shown", async ({ page }) => {
  const url = await boardUrl(page.request);
  await page.request.patch(`${url}/cards/card-3`, { data: { priority: "high" } });
  await page.request.patch(`${url}/cards/card-6`, { data: { priority: "high" } });
  await page.reload();
  const cards = page.locator('[data-testid^="card-card-"]');
  await expect(cards).toHaveCount(8);

  await page.getByLabel("Search cards").fill("verify");
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId("card-card-6")).toBeVisible();
  await expect(page.getByText("Showing 1 of 8 cards")).toBeVisible();

  await page.getByLabel("Search cards").fill("");
  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(cards).toHaveCount(2);
  await expect(page.getByTestId("card-card-3")).toBeVisible();
  await expect(page.getByTestId("card-card-6")).toBeVisible();

  await page.getByLabel("Filter by priority").selectOption("");
  await expect(cards).toHaveCount(8);
});

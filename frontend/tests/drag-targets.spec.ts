import { expect, test, type Page } from "@playwright/test";
import { signInWithFreshBoard } from "./helpers";
import { defaultBoard } from "../src/test/fixtures";

// Regression: the card must land in the column the pointer is released over,
// even when that column is empty and its neighbours have cards.

// Columns start about 340px down, so the +450px drop is below a 720px-high viewport. There
// dnd-kit auto-scrolls the page and the pointer ends up under the column, not in it.
test.use({ viewport: { width: 1280, height: 1200 } });

type Layout = Record<string, string[]>;

const putLayout = async (page: Page, layout: Layout) => {
  const board = structuredClone(defaultBoard);
  for (const column of board.columns) {
    column.cardIds = layout[column.id] ?? [];
  }
  const response = await page.request.put("/api/board", { data: board });
  expect(response.ok()).toBe(true);
};

const dragToColumn = async (page: Page, cardId: string, columnId: string, offsetY: number) => {
  const card = await page.getByTestId(`card-${cardId}`).boundingBox();
  const column = await page.getByTestId(`column-${columnId}`).boundingBox();
  if (!card || !column) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(column.x + column.width / 2, column.y + offsetY, { steps: 20 });
  await page.mouse.up();
};

const columnOf = (page: Page, cardId: string) =>
  page.evaluate(
    (id) =>
      document
        .querySelector(`[data-testid="card-${id}"]`)
        ?.closest('[data-testid^="column-"]')
        ?.getAttribute("data-testid"),
    cardId
  );

const savedColumnOf = async (page: Page, cardId: string) => {
  const board = await (await page.request.get("/api/board")).json();
  return board.columns.find((c: { cardIds: string[] }) => c.cardIds.includes(cardId)).id;
};

test.beforeEach(async ({ page }) => {
  await signInWithFreshBoard(page);
});

const offsets = [40, 150, 300, 450];

for (const offsetY of offsets) {
  test(`dropping on an empty Backlog column at +${offsetY}px keeps the card there`, async ({ page }) => {
    await putLayout(page, {
      "col-discovery": ["card-3"],
      "col-progress": ["card-1", "card-2", "card-4", "card-5"],
      "col-review": ["card-6"],
      "col-done": ["card-7", "card-8"],
    });
    await page.goto("/");
    await dragToColumn(page, "card-6", "col-backlog", offsetY);

    await expect(page.getByTestId("column-col-backlog").getByTestId("card-card-6")).toBeVisible();
    await expect.poll(() => savedColumnOf(page, "card-6")).toBe("col-backlog");
  });

  test(`dropping on an empty Review column at +${offsetY}px keeps the card there`, async ({ page }) => {
    await putLayout(page, {
      "col-backlog": ["card-1", "card-2", "card-6"],
      "col-discovery": ["card-3"],
      "col-progress": ["card-4", "card-5"],
      "col-done": ["card-8", "card-7"],
    });
    await page.goto("/");
    await dragToColumn(page, "card-1", "col-review", offsetY);

    await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
    await expect.poll(() => savedColumnOf(page, "card-1")).toBe("col-review");
  });
}

test("dropping below the cards of a non-empty column keeps the card in that column", async ({ page }) => {
  await page.goto("/");
  await dragToColumn(page, "card-1", "col-review", 400);
  expect(await columnOf(page, "card-1")).toBe("column-col-review");
  await expect.poll(() => savedColumnOf(page, "card-1")).toBe("col-review");
});

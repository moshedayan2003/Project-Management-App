import { expect, test } from "@playwright/test";
import { signInWithFreshBoard } from "./helpers";

// Small windows stand in for browser zoom: 175% on a 1366x768 laptop is 781x439,
// 300% on a 1920x1080 screen is 640x360.

test.describe("zoomed in on a laptop (781 wide)", () => {
  test.use({ viewport: { width: 781, height: 439 } });

  test("columns that do not fit wrap onto the next row instead of scrolling sideways", async ({ page }) => {
    await signInWithFreshBoard(page);
    await page.goto("/");
    const done = page.getByTestId("column-col-done");
    await expect(done).toBeAttached();

    const sidewaysOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(sidewaysOverflow).toBe(0);
    for (const id of ["col-backlog", "col-discovery", "col-progress", "col-review", "col-done"]) {
      const box = await page.getByTestId(`column-${id}`).boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(781);
    }
    const backlog = await page.getByTestId("column-col-backlog").boundingBox();
    const doneBox = await done.boundingBox();
    expect(doneBox!.y).toBeGreaterThan(backlog!.y + backlog!.height);
  });

  test("a card can be dragged into a column on the second row", async ({ page }) => {
    await page.setViewportSize({ width: 781, height: 1000 });
    await signInWithFreshBoard(page);
    await page.goto("/");
    const card = await page.getByTestId("card-card-1").boundingBox();
    const done = await page.getByTestId("column-col-done").boundingBox();

    await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
    await page.mouse.down();
    await page.mouse.move(done!.x + done!.width / 2, done!.y + done!.height - 20, { steps: 20 });
    await page.mouse.up();

    await expect(page.getByTestId("column-col-done").getByTestId("card-card-1")).toBeVisible();
    await expect
      .poll(async () => (await (await page.request.get("/api/board")).json()).columns[4].cardIds)
      .toContain("card-1");
  });
});

test.describe("zoomed in to 300% (640x360)", () => {
  test.use({ viewport: { width: 640, height: 360 } });

  test("the opened assistant fits the window and can be hidden again", async ({ page }) => {
    await signInWithFreshBoard(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Show AI assistant" }).click();
    // The panel grows in from the corner; measure it once the animation has ended.
    await page.waitForFunction(() => document.querySelector("aside")!.getAnimations().length === 0);
    const panel = await page.getByRole("complementary", { name: "AI assistant" }).boundingBox();
    expect(panel!.y).toBeGreaterThanOrEqual(0);

    const hide = page.getByRole("button", { name: "Hide" });
    await expect(hide).toBeInViewport({ ratio: 1 });
    await expect(page.getByLabel("Message")).toBeInViewport({ ratio: 1 });
    await hide.click();
    await expect(page.getByRole("complementary", { name: "AI assistant" })).toBeHidden();
  });
});

import { expect, type Page } from "@playwright/test";
import { defaultBoard } from "../src/test/fixtures";

// Signs in through the API and resets the saved board, so each test starts from the demo board.
export const signInWithFreshBoard = async (page: Page) => {
  const login = await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
  expect(login.ok()).toBe(true);
  const reset = await page.request.put("/api/board", { data: defaultBoard });
  expect(reset.ok()).toBe(true);
};

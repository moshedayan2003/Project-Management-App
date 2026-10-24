import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { defaultBoard } from "../src/test/fixtures";

// The demo user's first board. Tests share it (one worker), and signInWithFreshBoard resets it.
export const boardUrl = async (request: APIRequestContext) => {
  const boards = await (await request.get("/api/boards")).json();
  return `/api/boards/${boards[0].id}`;
};

export const savedBoard = async (request: APIRequestContext) =>
  (await request.get(await boardUrl(request))).json();

// Signs in through the API and resets the demo user to one board named "My board" holding
// the demo cards, so each test starts from the same state.
export const signInWithFreshBoard = async (page: Page) => {
  const login = await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
  expect(login.ok()).toBe(true);
  let boards = await (await page.request.get("/api/boards")).json();
  if (boards.length === 0) {
    await page.request.post("/api/boards", { data: { name: "My board" } });
    boards = await (await page.request.get("/api/boards")).json();
  }
  for (const extra of boards.slice(1)) {
    await page.request.delete(`/api/boards/${extra.id}`);
  }
  const url = `/api/boards/${boards[0].id}`;
  expect((await page.request.patch(url, { data: { name: "My board" } })).ok()).toBe(true);
  expect((await page.request.put(url, { data: defaultBoard })).ok()).toBe(true);
};

// A new account with its own empty board, signed in through the UI's API (shares the
// page's cookies). Usernames are unique so runs never collide.
export const registerNewUser = async (page: Page) => {
  const username = `u${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const response = await page.request.post("/api/register", {
    data: { username, password: "password123" },
  });
  expect(response.ok()).toBe(true);
  return username;
};

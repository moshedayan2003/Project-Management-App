import type { BoardData, CardFields } from "@/lib/kanban";

export class ApiError extends Error {
  constructor(public status: number) {
    super(`Request failed with status ${status}`);
  }
}

export type User = { id: number; username: string };
export type BoardSummary = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  card_count: number;
};
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatResult = {
  message: string;
  board: BoardData;
  applied: unknown[];
  skipped: unknown[];
};

const request = async <T = BoardData>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> => {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new ApiError(response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
};

const boardPath = (boardId: number) => `/api/boards/${boardId}`;

export const api = {
  // account
  me: () => request<User>("GET", "/api/me"),
  login: (username: string, password: string) =>
    request<User>("POST", "/api/login", { username, password }),
  register: (username: string, password: string) =>
    request<User>("POST", "/api/register", { username, password }),
  logout: () => request<void>("POST", "/api/logout"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("POST", "/api/me/password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  deleteAccount: (password: string) =>
    request<void>("DELETE", "/api/me", { password }),

  // the list of boards
  listBoards: () => request<BoardSummary[]>("GET", "/api/boards"),
  createBoard: (name: string) =>
    request<BoardSummary>("POST", "/api/boards", { name }),
  renameBoard: (boardId: number, name: string) =>
    request<BoardSummary>("PATCH", boardPath(boardId), { name }),
  deleteBoard: (boardId: number) =>
    request<void>("DELETE", boardPath(boardId)),

  // one board's content; each call returns the full updated board
  getBoard: (boardId: number) => request("GET", boardPath(boardId)),
  createCard: (boardId: number, columnId: string, title: string, details: string) =>
    request("POST", `${boardPath(boardId)}/cards`, { column_id: columnId, title, details }),
  updateCard: (boardId: number, cardId: string, changes: Partial<CardFields>) =>
    request("PATCH", `${boardPath(boardId)}/cards/${cardId}`, changes),
  moveCard: (boardId: number, cardId: string, columnId: string, position: number) =>
    request("POST", `${boardPath(boardId)}/cards/${cardId}/move`, {
      column_id: columnId,
      position,
    }),
  deleteCard: (boardId: number, cardId: string) =>
    request("DELETE", `${boardPath(boardId)}/cards/${cardId}`),
  renameColumn: (boardId: number, columnId: string, title: string) =>
    request("PATCH", `${boardPath(boardId)}/columns/${columnId}`, { title }),
  chat: (boardId: number, message: string, history: ChatMessage[]) =>
    request<ChatResult>("POST", `${boardPath(boardId)}/chat`, { message, history }),
};

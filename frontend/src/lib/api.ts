import type { BoardData } from "@/lib/kanban";

export class ApiError extends Error {
  constructor(public status: number) {
    super(`Request failed with status ${status}`);
  }
}

const request = async (
  method: string,
  path: string,
  body?: unknown
): Promise<BoardData> => {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new ApiError(response.status);
  }
  return response.json();
};

export const api = {
  getBoard: () => request("GET", "/api/board"),
  createCard: (columnId: string, title: string, details: string) =>
    request("POST", "/api/cards", { column_id: columnId, title, details }),
  updateCard: (cardId: string, title: string, details: string) =>
    request("PATCH", `/api/cards/${cardId}`, { title, details }),
  moveCard: (cardId: string, columnId: string, position: number) =>
    request("POST", `/api/cards/${cardId}/move`, {
      column_id: columnId,
      position,
    }),
  deleteCard: (cardId: string) => request("DELETE", `/api/cards/${cardId}`),
  renameColumn: (columnId: string, title: string) =>
    request("PATCH", `/api/columns/${columnId}`, { title }),
};

import type { BoardSummary } from "@/lib/api";
import type { BoardData, Card } from "@/lib/kanban";

// A card with only a title and details set, like the demo cards.
export const card = (id: string, title: string, details = ""): Card => ({
  id,
  title,
  details,
  priority: null,
  due_date: null,
  labels: [],
});

// Mirrors the backend default board.
export const defaultBoard: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": card(
      "card-1",
      "Align roadmap themes",
      "Draft quarterly themes with impact statements and metrics."
    ),
    "card-2": card(
      "card-2",
      "Gather customer signals",
      "Review support tags, sales notes, and churn feedback."
    ),
    "card-3": card(
      "card-3",
      "Prototype analytics view",
      "Sketch initial dashboard layout and key drill-downs."
    ),
    "card-4": card(
      "card-4",
      "Refine status language",
      "Standardize column labels and tone across the board."
    ),
    "card-5": card(
      "card-5",
      "Design card layout",
      "Add hierarchy and spacing for scanning dense lists."
    ),
    "card-6": card(
      "card-6",
      "QA micro-interactions",
      "Verify hover, focus, and loading states."
    ),
    "card-7": card(
      "card-7",
      "Ship marketing page",
      "Final copy approved and asset pack delivered."
    ),
    "card-8": card(
      "card-8",
      "Close onboarding sprint",
      "Document release notes and share internally."
    ),
  },
};

export const boardSummary = (id: number, name: string, cardCount = 8): BoardSummary => ({
  id,
  name,
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
  card_count: cardCount,
});

import {
  isOverdue,
  matchesFilter,
  moveCard,
  parseLabels,
  today,
  type Column,
} from "@/lib/kanban";
import { card } from "@/test/fixtures";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("returns columns unchanged for unknown ids", () => {
    expect(moveCard(baseColumns, "missing", "card-1")).toBe(baseColumns);
    expect(moveCard(baseColumns, "card-1", "missing")).toBe(baseColumns);
  });

  it("returns columns unchanged when dropped on itself", () => {
    const result = moveCard(baseColumns, "card-1", "card-1");
    expect(result.map((c) => c.cardIds)).toEqual([
      ["card-1", "card-2"],
      ["card-3"],
    ]);
  });

  it("moves a card into an empty column", () => {
    const columns: Column[] = [
      { id: "col-a", title: "A", cardIds: ["card-1"] },
      { id: "col-b", title: "B", cardIds: [] },
    ];
    const result = moveCard(columns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual([]);
    expect(result[1].cardIds).toEqual(["card-1"]);
  });

  it("does not mutate the input", () => {
    moveCard(baseColumns, "card-2", "card-3");
    expect(baseColumns[0].cardIds).toEqual(["card-1", "card-2"]);
    expect(baseColumns[1].cardIds).toEqual(["card-3"]);
  });
});

describe("matchesFilter", () => {
  const item = { ...card("c", "Write API docs", "For the Public endpoints"), labels: ["Backend"] };
  const all = { query: "", priority: "" } as const;

  it("matches everything with an empty filter", () => {
    expect(matchesFilter(item, all)).toBe(true);
    expect(matchesFilter(item, { ...all, query: "   " })).toBe(true);
  });

  it("needs every word somewhere in the title, details or labels, ignoring case", () => {
    expect(matchesFilter(item, { ...all, query: "api" })).toBe(true);
    expect(matchesFilter(item, { ...all, query: "public DOCS" })).toBe(true);
    expect(matchesFilter(item, { ...all, query: "backend write" })).toBe(true);
    expect(matchesFilter(item, { ...all, query: "api frontend" })).toBe(false);
  });

  it("filters by priority", () => {
    expect(matchesFilter(item, { ...all, priority: "high" })).toBe(false);
    expect(matchesFilter({ ...item, priority: "high" }, { ...all, priority: "high" })).toBe(true);
    expect(matchesFilter({ ...item, priority: "high" }, { query: "nope", priority: "high" })).toBe(false);
  });
});

describe("dates and labels", () => {
  it("today is the local date as YYYY-MM-DD", () => {
    const now = new Date();
    const expected = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((n) => String(n).padStart(2, "0"))
      .join("-");
    expect(today()).toBe(expected);
  });

  it("a card is overdue only when its due date is before today", () => {
    const due = (date: string | null) => ({ ...card("c", "C"), due_date: date });
    expect(isOverdue(due("2026-10-18"), "2026-10-19")).toBe(true);
    expect(isOverdue(due("2026-10-19"), "2026-10-19")).toBe(false);
    expect(isOverdue(due("2026-10-20"), "2026-10-19")).toBe(false);
    expect(isOverdue(due(null), "2026-10-19")).toBe(false);
  });

  it("parses comma separated labels", () => {
    expect(parseLabels(" ux, api ,, ")).toEqual(["ux", "api"]);
    expect(parseLabels("")).toEqual([]);
  });
});

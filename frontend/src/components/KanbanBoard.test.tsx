import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { callsTo, stubFetch, type FakeResponse } from "@/test/fetch";
import { card, defaultBoard } from "@/test/fixtures";

const ok = (body: unknown = defaultBoard): FakeResponse => ({ status: 200, body });

// Fake server: GET returns the default board; other calls succeed unless overridden.
const serve = (
  override: (method: string, url: string, body: unknown) => FakeResponse | undefined = () => undefined
) =>
  stubFetch((method, url, body) => override(method, url, body) ?? ok());

const renderKanban = (onLogout = () => {}) =>
  render(<KanbanBoard boardId={1} header={<p>Header</p>} onLogout={onLogout} />);

const renderBoard = async (onLogout = () => {}) => {
  renderKanban(onLogout);
  await screen.findAllByTestId(/^column-/);
};

const getFirstColumn = () => screen.getAllByTestId(/^column-/)[0];
const writes = (mock: ReturnType<typeof stubFetch>) =>
  callsTo(mock).filter((call) => call.request !== "GET /api/boards/1");

describe("KanbanBoard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the board from the API", async () => {
    const mock = serve();
    renderKanban();
    expect(screen.getByText("Loading board...")).toBeInTheDocument();
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(5);
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(callsTo(mock)).toEqual([{ request: "GET /api/boards/1", body: undefined }]);
  });

  it("shows a message when the board cannot be loaded", async () => {
    serve(() => ({ status: 500 }));
    renderKanban();
    expect(await screen.findByText("Could not load the board.")).toBeInTheDocument();
  });

  it("returns to the login when the session has expired", async () => {
    serve(() => ({ status: 401 }));
    const onLogout = vi.fn();
    renderKanban(onLogout);
    await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });

  it("renames a column and saves it when the input loses focus", async () => {
    const mock = serve();
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas");
    expect(input).toHaveValue("Ideas");
    expect(writes(mock)).toEqual([]); // nothing is sent while typing

    await userEvent.tab();
    expect(writes(mock)).toEqual([
      { request: "PATCH /api/boards/1/columns/col-backlog", body: { title: "Ideas" } },
    ]);
  });

  it("adds a card using the board returned by the server", async () => {
    const withNewCard = structuredClone(defaultBoard);
    withNewCard.cards["card-new"] = card("card-new", "New card", "Notes");
    withNewCard.columns[0].cardIds.push("card-new");
    const mock = serve((method, url) =>
      method === "POST" && url === "/api/boards/1/cards" ? ok(withNewCard) : undefined
    );
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();
    expect(writes(mock)).toEqual([
      {
        request: "POST /api/boards/1/cards",
        body: { column_id: "col-backlog", title: "New card", details: "Notes" },
      },
    ]);
  });

  it("shows an error and no card when adding fails", async () => {
    serve((method) => (method === "POST" ? { status: 500 } : undefined));
    await renderBoard();
    const column = getFirstColumn();
    const before = within(column).queryAllByTestId(/^card-/).length;
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Doomed");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await screen.findByText("Could not add the card.")).toBeInTheDocument();
    expect(within(column).queryAllByTestId(/^card-/)).toHaveLength(before);
  });

  it("does not call the API for a blank new card", async () => {
    const mock = serve();
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "   ");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
    expect(writes(mock)).toEqual([]);
  });

  it("cancels adding a card and clears the form", async () => {
    const mock = serve();
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Draft");
    await userEvent.click(within(column).getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));

    expect(within(column).getByPlaceholderText(/card title/i)).toHaveValue("");
    expect(writes(mock)).toEqual([]);
  });

  it("edits a card, showing and saving the change", async () => {
    const mock = serve();
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    const title = within(column).getByLabelText("Card title");
    const details = within(column).getByLabelText("Card details");
    await userEvent.clear(title);
    await userEvent.type(title, "Renamed card");
    await userEvent.clear(details);
    await userEvent.type(details, "New details");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    expect(within(column).getByText("Renamed card")).toBeInTheDocument();
    expect(within(column).getByText("New details")).toBeInTheDocument();
    expect(within(column).queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(writes(mock)).toEqual([
      {
        request: "PATCH /api/boards/1/cards/card-1",
        body: {
          title: "Renamed card",
          details: "New details",
          priority: null,
          due_date: null,
          labels: [],
        },
      },
    ]);
  });

  it("discards edits on cancel without calling the API", async () => {
    const mock = serve();
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    await userEvent.type(within(column).getByLabelText("Card title"), " extra");
    await userEvent.click(within(column).getByRole("button", { name: "Cancel" }));

    expect(within(column).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(writes(mock)).toEqual([]);
  });

  it("does not save a card with a blank title", async () => {
    const mock = serve();
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    const title = within(column).getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "   ");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    expect(within(column).getByLabelText("Card title")).toBeInTheDocument();
    expect(writes(mock)).toEqual([]);
  });

  it("removes a card and tells the server", async () => {
    const mock = serve();
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: "Delete Align roadmap themes" })
    );

    expect(within(column).queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(writes(mock)).toEqual([{ request: "DELETE /api/boards/1/cards/card-1", body: undefined }]);
  });

  it("reloads the server's board and shows an error when a save fails", async () => {
    const mock = serve((method) => (method === "PATCH" ? { status: 500 } : undefined));
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    const title = within(column).getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Will not stick");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Could not save your change. The board was reloaded.")
    ).toBeInTheDocument();
    expect(await within(column).findByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(column).queryByText("Will not stick")).not.toBeInTheDocument();
    expect(callsTo(mock).filter((c) => c.request === "GET /api/boards/1")).toHaveLength(2);
  });

  it("clears the error after the next successful change", async () => {
    let failing = true;
    serve((method) => (method === "DELETE" && failing ? { status: 500 } : undefined));
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: "Delete Align roadmap themes" })
    );
    expect(await screen.findByText(/Could not save your change/)).toBeInTheDocument();

    failing = false;
    await userEvent.click(
      within(column).getByRole("button", { name: "Delete Align roadmap themes" })
    );
    await vi.waitFor(() =>
      expect(screen.queryByText(/Could not save your change/)).not.toBeInTheDocument()
    );
  });

  it("shows the header it is given, also while loading", async () => {
    serve();
    renderKanban();
    expect(screen.getByText("Header")).toBeInTheDocument();
    await screen.findAllByTestId(/^column-/);
    expect(screen.getByText("Header")).toBeInTheDocument();
  });

  it("sets priority, due date and labels on a card", async () => {
    const mock = serve();
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "high");
    await userEvent.type(within(column).getByLabelText("Due date"), "2030-11-05");
    await userEvent.type(within(column).getByLabelText("Labels"), "ux, , api ");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    const shown = within(column).getByTestId("card-card-1");
    expect(within(shown).getByText("High")).toBeInTheDocument();
    expect(within(shown).getByText("ux")).toBeInTheDocument();
    expect(within(shown).getByText("api")).toBeInTheDocument();
    expect(within(shown).getByTestId("due-date")).toHaveTextContent("Nov 5, 2030");
    expect(writes(mock)[0].body).toEqual({
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
      priority: "high",
      due_date: "2030-11-05",
      labels: ["ux", "api"],
    });
  });

  it("clears priority, due date and labels", async () => {
    const board = structuredClone(defaultBoard);
    Object.assign(board.cards["card-1"], {
      priority: "low",
      due_date: "2030-01-01",
      labels: ["old"],
    });
    const mock = serve((method) => (method === "GET" ? ok(board) : undefined));
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    expect(within(column).getByLabelText("Labels")).toHaveValue("old");
    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "");
    await userEvent.clear(within(column).getByLabelText("Due date"));
    await userEvent.clear(within(column).getByLabelText("Labels"));
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    expect(writes(mock)[0].body).toMatchObject({ priority: null, due_date: null, labels: [] });
    expect(within(column).queryByTestId("due-date")).not.toBeInTheDocument();
  });

  it("marks past due dates as overdue, except in Done", async () => {
    const board = structuredClone(defaultBoard);
    board.cards["card-1"].due_date = "2000-01-01";
    board.cards["card-2"].due_date = "2999-01-01";
    board.cards["card-7"].due_date = "2000-01-01";
    serve((method) => (method === "GET" ? ok(board) : undefined));
    await renderBoard();
    const due = (cardId: string) =>
      within(screen.getByTestId(`card-${cardId}`)).getByTestId("due-date");
    expect(due("card-1")).toHaveAttribute("title", "Overdue");
    expect(due("card-1")).toHaveTextContent("(overdue)");
    expect(due("card-2")).toHaveAttribute("title", "Due date");
    expect(due("card-7")).toHaveAttribute("title", "Due date");
  });

  it("filters cards by search text, across title, details and labels", async () => {
    const board = structuredClone(defaultBoard);
    board.cards["card-6"].labels = ["Frontend"];
    serve((method) => (method === "GET" ? ok(board) : undefined));
    await renderBoard();
    const search = screen.getByLabelText("Search cards");

    await userEvent.type(search, "roadmap");
    expect(screen.getAllByTestId(/^card-card-/).map((el) => el.dataset.testid)).toEqual([
      "card-card-1",
    ]);
    expect(screen.getByText("Showing 1 of 8 cards")).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "churn");  // in card-2's details
    expect(screen.getByTestId("card-card-2")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^card-card-/)).toHaveLength(1);

    await userEvent.clear(search);
    await userEvent.type(search, "frontend");  // a label
    expect(screen.getAllByTestId(/^card-card-/).map((el) => el.dataset.testid)).toEqual([
      "card-card-6",
    ]);

    await userEvent.clear(search);
    expect(screen.getAllByTestId(/^card-card-/)).toHaveLength(8);
    expect(screen.getByText("8 cards")).toBeInTheDocument();
  });

  it("filters cards by priority", async () => {
    const board = structuredClone(defaultBoard);
    board.cards["card-3"].priority = "high";
    board.cards["card-5"].priority = "high";
    board.cards["card-8"].priority = "low";
    serve((method) => (method === "GET" ? ok(board) : undefined));
    await renderBoard();

    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
    expect(screen.getAllByTestId(/^card-card-/).map((el) => el.dataset.testid)).toEqual([
      "card-card-3",
      "card-card-5",
    ]);
    // the column count follows the filter
    expect(within(getFirstColumn()).getByLabelText("0 cards")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search cards"), "design");
    expect(screen.getAllByTestId(/^card-card-/).map((el) => el.dataset.testid)).toEqual([
      "card-card-5",
    ]);
  });
});

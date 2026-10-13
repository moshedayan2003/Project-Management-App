import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { callsTo, stubFetch, type FakeResponse } from "@/test/fetch";
import { defaultBoard } from "@/test/fixtures";

const ok = (body: unknown = defaultBoard): FakeResponse => ({ status: 200, body });

// Fake server: GET returns the default board; other calls succeed unless overridden.
const serve = (
  override: (method: string, url: string, body: unknown) => FakeResponse | undefined = () => undefined
) =>
  stubFetch((method, url, body) => override(method, url, body) ?? ok());

const renderBoard = async (onLogout = () => {}) => {
  render(<KanbanBoard onLogout={onLogout} />);
  await screen.findAllByTestId(/^column-/);
};

const getFirstColumn = () => screen.getAllByTestId(/^column-/)[0];
const writes = (mock: ReturnType<typeof stubFetch>) =>
  callsTo(mock).filter((call) => call.request !== "GET /api/board");

describe("KanbanBoard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the board from the API", async () => {
    const mock = serve();
    render(<KanbanBoard onLogout={() => {}} />);
    expect(screen.getByText("Loading board...")).toBeInTheDocument();
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(5);
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(callsTo(mock)).toEqual([{ request: "GET /api/board", body: undefined }]);
  });

  it("shows a message when the board cannot be loaded", async () => {
    serve(() => ({ status: 500 }));
    render(<KanbanBoard onLogout={() => {}} />);
    expect(await screen.findByText("Could not load the board.")).toBeInTheDocument();
  });

  it("returns to the login when the session has expired", async () => {
    serve(() => ({ status: 401 }));
    const onLogout = vi.fn();
    render(<KanbanBoard onLogout={onLogout} />);
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
      { request: "PATCH /api/columns/col-backlog", body: { title: "Ideas" } },
    ]);
  });

  it("adds a card using the board returned by the server", async () => {
    const withNewCard = structuredClone(defaultBoard);
    withNewCard.cards["card-new"] = { id: "card-new", title: "New card", details: "Notes" };
    withNewCard.columns[0].cardIds.push("card-new");
    const mock = serve((method, url) =>
      method === "POST" && url === "/api/cards" ? ok(withNewCard) : undefined
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
        request: "POST /api/cards",
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
        request: "PATCH /api/cards/card-1",
        body: { title: "Renamed card", details: "New details" },
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
    expect(writes(mock)).toEqual([{ request: "DELETE /api/cards/card-1", body: undefined }]);
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
    expect(callsTo(mock).filter((c) => c.request === "GET /api/board")).toHaveLength(2);
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

  it("logs out", async () => {
    serve();
    const onLogout = vi.fn();
    await renderBoard(onLogout);
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalled();
  });
});

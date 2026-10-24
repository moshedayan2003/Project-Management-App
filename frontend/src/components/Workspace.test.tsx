import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import { callsTo, stubFetch, type FakeResponse } from "@/test/fetch";
import { boardSummary, card, defaultBoard } from "@/test/fixtures";
import type { BoardData } from "@/lib/kanban";

const user = { id: 1, username: "ann" };

const emptyBoard = (): BoardData => ({
  columns: defaultBoard.columns.map((column) => ({ ...column, cardIds: [] })),
  cards: {},
});

const secondBoard = emptyBoard();
secondBoard.columns[0].cardIds = ["card-x"];
secondBoard.cards["card-x"] = card("card-x", "Only on the second board");

type Override = (method: string, url: string, body: unknown) => FakeResponse | undefined;

// Fake server with two boards; `override` can replace any answer.
const serve = (override: Override = () => undefined) =>
  stubFetch((method, url, body) => {
    const answer = override(method, url, body);
    if (answer) return answer;
    if (url === "/api/boards" && method === "GET")
      return { status: 200, body: [boardSummary(1, "My board"), boardSummary(2, "Launch", 1)] };
    if (url === "/api/boards" && method === "POST")
      return { status: 201, body: boardSummary(3, (body as { name: string }).name, 0) };
    if (url === "/api/boards/1" && method === "GET") return { status: 200, body: defaultBoard };
    if (url === "/api/boards/2" && method === "GET") return { status: 200, body: secondBoard };
    if (url === "/api/boards/3" && method === "GET") return { status: 200, body: emptyBoard() };
    if (method === "PATCH" && url.startsWith("/api/boards/"))
      return { status: 200, body: boardSummary(Number(url.split("/")[3]), (body as { name: string }).name) };
    return { status: 204 };
  });

const renderWorkspace = async (onLogout = vi.fn()) => {
  render(<Workspace user={user} onLogout={onLogout} />);
  await screen.findAllByTestId(/^column-/);
  return onLogout;
};

const boardPicker = () => screen.getByLabelText("Board") as HTMLSelectElement;

describe("Workspace", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens the first board and lists all boards", async () => {
    serve();
    await renderWorkspace();
    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
    expect(boardPicker().value).toBe("1");
    expect([...boardPicker().options].map((o) => o.text)).toEqual(["My board", "Launch"]);
  });

  it("switches boards and remembers the choice", async () => {
    serve();
    await renderWorkspace();
    await userEvent.selectOptions(boardPicker(), "2");
    expect(await screen.findByText("Only on the second board")).toBeInTheDocument();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(localStorage.getItem("pm-board")).toBe("2");
  });

  it("opens the remembered board", async () => {
    localStorage.setItem("pm-board", "2");
    serve();
    await renderWorkspace();
    expect(await screen.findByText("Only on the second board")).toBeInTheDocument();
  });

  it("ignores a remembered board that no longer exists", async () => {
    localStorage.setItem("pm-board", "99");
    serve();
    await renderWorkspace();
    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("creates a board and opens it", async () => {
    const mock = serve();
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "  Roadmap ");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByText("0 cards")).toBeInTheDocument();
    expect(boardPicker().value).toBe("3");
    expect(boardPicker().selectedOptions[0].text).toBe("Roadmap");
    expect(callsTo(mock)).toContainEqual({ request: "POST /api/boards", body: { name: "Roadmap" } });
  });

  it("does not create a board without a name, and Escape cancels", async () => {
    const mock = serve();
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(screen.getByLabelText("Board name")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Board name"), "{Escape}");
    expect(boardPicker()).toBeInTheDocument();
    expect(callsTo(mock).some((c) => c.request === "POST /api/boards")).toBe(false);
  });

  it("renames the open board", async () => {
    const mock = serve();
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Rename board" }));
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("My board");
    await userEvent.clear(input);
    await userEvent.type(input, "Roadmap");
    await userEvent.click(screen.getByRole("button", { name: "Save board name" }));

    expect(await screen.findByRole("option", { name: "Roadmap" })).toBeInTheDocument();
    expect(callsTo(mock)).toContainEqual({ request: "PATCH /api/boards/1", body: { name: "Roadmap" } });
  });

  it("deletes the open board after confirming and opens the next", async () => {
    const mock = serve();
    await renderWorkspace();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(confirm).toHaveBeenCalledWith('Delete "My board" and all its cards?');
    expect(callsTo(mock).some((c) => c.request === "DELETE /api/boards/1")).toBe(false);

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(await screen.findByText("Only on the second board")).toBeInTheDocument();
    expect([...boardPicker().options].map((o) => o.text)).toEqual(["Launch"]);
  });

  it("shows an empty state when there are no boards", async () => {
    serve((method, url) => (url === "/api/boards" && method === "GET" ? { status: 200, body: [] } : undefined));
    render(<Workspace user={user} onLogout={vi.fn()} />);
    expect(await screen.findByText("No boards yet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Board")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "First");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(5);
  });

  it("shows an error when a board change fails", async () => {
    serve((method) => (method === "POST" ? { status: 500 } : undefined));
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "Doomed");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(await screen.findByText("Could not create the board.")).toBeInTheDocument();
    expect(boardPicker().value).toBe("1");
  });

  it("shows an error when the boards cannot be loaded", async () => {
    serve((method, url) => (url === "/api/boards" ? { status: 500 } : undefined));
    render(<Workspace user={user} onLogout={vi.fn()} />);
    expect(await screen.findByText("Could not load your boards.")).toBeInTheDocument();
  });

  it("returns to the login when the session has expired", async () => {
    serve(() => ({ status: 401 }));
    const onLogout = vi.fn();
    render(<Workspace user={user} onLogout={onLogout} />);
    await vi.waitFor(() => expect(onLogout).toHaveBeenCalled());
  });

  it("logs out", async () => {
    serve();
    const onLogout = await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalled();
  });

  describe("account dialog", () => {
    const openAccount = async () => {
      await userEvent.click(screen.getByRole("button", { name: /account settings/i }));
      return screen.getByRole("dialog", { name: "Account" });
    };

    it("changes the password", async () => {
      const mock = serve();
      await renderWorkspace();
      const dialog = await openAccount();
      await userEvent.type(screen.getByLabelText("Current password"), "old password");
      await userEvent.type(screen.getByLabelText("New password"), "new password");
      await userEvent.click(screen.getByRole("button", { name: "Change password" }));

      expect(await within(dialog).findByRole("status")).toHaveTextContent("Password changed.");
      expect(screen.getByLabelText("Current password")).toHaveValue("");
      expect(callsTo(mock)).toContainEqual({
        request: "POST /api/me/password",
        body: { current_password: "old password", new_password: "new password" },
      });
    });

    it.each([
      [403, "Your current password is wrong."],
      [422, "The new password needs at least 8 characters."],
      [500, "Could not change the password."],
    ])("explains a failed password change (%i)", async (status, message) => {
      serve((method, url) => (url === "/api/me/password" ? { status } : undefined));
      await renderWorkspace();
      await openAccount();
      await userEvent.type(screen.getByLabelText("Current password"), "x");
      await userEvent.type(screen.getByLabelText("New password"), "y");
      await userEvent.click(screen.getByRole("button", { name: "Change password" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
    });

    it("deletes the account after confirming", async () => {
      const mock = serve();
      const onLogout = await renderWorkspace();
      await openAccount();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await userEvent.type(screen.getByLabelText("Password"), "my password");
      await userEvent.click(screen.getByRole("button", { name: "Delete account" }));

      await vi.waitFor(() => expect(onLogout).toHaveBeenCalled());
      expect(callsTo(mock)).toContainEqual({
        request: "DELETE /api/me",
        body: { password: "my password" },
      });
    });

    it("keeps the account when not confirmed or the password is wrong", async () => {
      const mock = serve((method, url) => (url === "/api/me" ? { status: 403 } : undefined));
      const onLogout = await renderWorkspace();
      await openAccount();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      await userEvent.type(screen.getByLabelText("Password"), "wrong");
      await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
      expect(callsTo(mock).some((c) => c.request === "DELETE /api/me")).toBe(false);

      confirm.mockReturnValue(true);
      await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Wrong password.");
      expect(onLogout).not.toHaveBeenCalled();
    });

    it("closes with the button, Escape, or a click outside", async () => {
      serve();
      await renderWorkspace();
      await openAccount();
      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await openAccount();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      const dialog = await openAccount();
      await userEvent.click(dialog.parentElement!);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

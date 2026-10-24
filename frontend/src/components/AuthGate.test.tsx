import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";
import { callsTo, stubFetch, type FakeResponse } from "@/test/fetch";
import { boardSummary, defaultBoard } from "@/test/fixtures";

const ann = { id: 1, username: "ann" };

// Fake server: `signedIn` decides /api/me; `login` and `register` give those calls' status.
const serve = ({ signedIn = false, login = 200, register = 201 } = {}) =>
  stubFetch((method, url): FakeResponse => {
    if (url === "/api/me") return signedIn ? { status: 200, body: ann } : { status: 401 };
    if (url === "/api/login") return { status: login, body: ann };
    if (url === "/api/register") return { status: register, body: ann };
    if (url === "/api/boards") return { status: 200, body: [boardSummary(1, "My board")] };
    if (url === "/api/boards/1") return { status: 200, body: defaultBoard };
    return { status: 204 };
  });

const fillAndSubmit = async (username: string, password: string, button: string) => {
  await userEvent.type(await screen.findByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: button }));
};

describe("AuthGate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the login form when not signed in", async () => {
    serve();
    render(<AuthGate />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Kanban Studio")).not.toBeInTheDocument();
  });

  it("shows the board when already signed in", async () => {
    serve({ signedIn: true });
    render(<AuthGate />);
    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeInTheDocument();
    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /account settings/i })).toBeInTheDocument();
  });

  it("falls back to the login form if the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    render(<AuthGate />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("logs in, shows the board, then logs out", async () => {
    const mock = serve();
    render(<AuthGate />);
    await fillAndSubmit("ann", "password", "Sign in");
    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
    expect(callsTo(mock)).toContainEqual({
      request: "POST /api/login",
      body: { username: "ann", password: "password" },
    });

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(callsTo(mock)).toContainEqual({ request: "POST /api/logout", body: undefined });
  });

  it("stays on the login form after a failed login", async () => {
    serve({ login: 401 });
    render(<AuthGate />);
    await fillAndSubmit("ann", "bad", "Sign in");
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("creates an account and opens the workspace", async () => {
    const mock = serve();
    render(<AuthGate />);
    await userEvent.click(await screen.findByRole("button", { name: "Create an account" }));
    await fillAndSubmit("ann", "long password", "Create account");
    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
    expect(callsTo(mock)).toContainEqual({
      request: "POST /api/register",
      body: { username: "ann", password: "long password" },
    });
  });

  it.each([
    [409, "That username is taken"],
    [422, "Use 3 to 32 lowercase letters"],
    [500, "Could not reach the server"],
  ])("explains a failed registration (%i)", async (status, message) => {
    serve({ register: status });
    render(<AuthGate />);
    await userEvent.click(await screen.findByRole("button", { name: "Create an account" }));
    await fillAndSubmit("ann", "long password", "Create account");
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});

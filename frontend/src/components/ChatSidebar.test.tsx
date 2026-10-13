import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import { callsTo, stubFetch, type FakeResponse } from "@/test/fetch";
import { defaultBoard } from "@/test/fixtures";

const reply = (over: Record<string, unknown> = {}): FakeResponse => ({
  status: 200,
  body: { message: "Done.", board: defaultBoard, applied: [], skipped: [], ...over },
});

const setup = (response: FakeResponse = reply()) => {
  const mock = stubFetch(() => response);
  const onBoardChange = vi.fn();
  const onUnauthorized = vi.fn();
  render(<ChatSidebar onBoardChange={onBoardChange} onUnauthorized={onUnauthorized} />);
  return { mock, onBoardChange, onUnauthorized };
};

const send = async (text: string) => {
  await userEvent.type(screen.getByLabelText("Message"), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
};

describe("ChatSidebar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("blocks empty input", async () => {
    const { mock } = setup();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Message"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(callsTo(mock)).toEqual([]);
  });

  it("sends on Enter and adds a new line on Shift+Enter", async () => {
    const { mock } = setup(reply({ message: "Got it." }));
    await userEvent.type(screen.getByLabelText("Message"), "line one{Shift>}{Enter}{/Shift}line two");
    expect(screen.getByLabelText("Message")).toHaveValue("line one\nline two");
    expect(callsTo(mock)).toEqual([]);
    await userEvent.type(screen.getByLabelText("Message"), "{Enter}");
    expect(await screen.findByText("Got it.")).toBeInTheDocument();
    expect(callsTo(mock)[0].body).toEqual({ message: "line one\nline two", history: [] });
  });

  it("sends the message and shows both sides of the conversation", async () => {
    const { mock } = setup(reply({ message: "Hello there." }));
    await send("hi");
    expect(await screen.findByText("Hello there.")).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(callsTo(mock)).toEqual([
      { request: "POST /api/chat", body: { message: "hi", history: [] } },
    ]);
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("shows a loading state while waiting", async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => (finish = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await pending;
        return { ok: true, status: 200, json: async () => reply().body } as Response;
      })
    );
    render(<ChatSidebar onBoardChange={() => {}} onUnauthorized={() => {}} />);
    await send("hi");
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    finish();
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("accumulates history and sends it with the next message", async () => {
    const { mock } = setup(reply({ message: "Answer." }));
    await send("first");
    await screen.findByText("Answer.");
    await send("second");
    await screen.findAllByText("Answer.");
    expect(callsTo(mock)[1].body).toEqual({
      message: "second",
      history: [
        { role: "user", content: "first" },
        { role: "assistant", content: "Answer." },
      ],
    });
  });

  it("hands the returned board to the board when operations were applied", async () => {
    const board = { ...defaultBoard, columns: defaultBoard.columns.slice() };
    const { onBoardChange } = setup(reply({ board, applied: [{ type: "delete_card" }] }));
    await send("delete something");
    await screen.findByText("Done.");
    expect(onBoardChange).toHaveBeenCalledWith(board);
  });

  it("leaves the board alone when nothing was applied", async () => {
    const { onBoardChange } = setup(reply());
    await send("just a question");
    await screen.findByText("Done.");
    expect(onBoardChange).not.toHaveBeenCalled();
  });

  it("mentions changes that could not be applied", async () => {
    setup(reply({ skipped: [{ error: "x" }] }));
    await send("do it");
    expect(await screen.findByText(/1 change\(s\) could not be applied/)).toBeInTheDocument();
  });

  it("shows an error when the assistant fails and allows another try", async () => {
    setup({ status: 502, body: { detail: "AI request failed" } });
    await send("hi");
    expect(await screen.findByRole("alert")).toHaveTextContent("could not answer");
    expect(screen.getByLabelText("Message")).toBeEnabled();
  });

  it("returns to login on 401", async () => {
    const { onUnauthorized } = setup({ status: 401 });
    await send("hi");
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });

  it("hides into the AI button and shows again without losing the conversation", async () => {
    setup();
    await send("hi");
    await screen.findByText("Done.");
    const panel = screen.getByLabelText("AI assistant", { selector: "aside" });
    expect(panel).not.toHaveAttribute("aria-hidden", "true");

    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");

    await userEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
    expect(panel).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByText("Done.")).toBeInTheDocument();
  });
});

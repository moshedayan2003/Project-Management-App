"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, PanelRightClose, Sparkles } from "lucide-react";
import { api, ApiError, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

// Four lines of text (24px each) plus the box padding; beyond this the box scrolls.
const MAX_INPUT_HEIGHT = 108;

type ChatSidebarProps = {
  boardId: number;
  onBoardChange: (board: BoardData) => void;
  onUnauthorized: () => void;
};

export const ChatSidebar = ({
  boardId,
  onBoardChange,
  onUnauthorized,
}: ChatSidebarProps) => {
  // Open by default only where it sits beside the board (xl); on smaller screens it
  // would float over the cards.
  const [open, setOpen] = useState(
    () => window.matchMedia("(min-width: 80rem)").matches
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    logRef.current?.scrollTo?.({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, error]);

  // Grow the box with its text up to 4 lines, then let it scroll.
  useEffect(() => {
    const box = inputRef.current;
    if (box) {
      box.style.height = "auto";
      box.style.height = `${Math.min(box.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    }
  }, [input, open]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  // Enter sends; Shift+Enter adds a new line.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }
    const history = messages;
    setMessages([...history, { role: "user", content: text }]);
    setInput("");
    setError("");
    setLoading(true);
    try {
      const result = await api.chat(boardId, text, history);
      let reply = result.message;
      if (result.skipped.length > 0) {
        reply += ` (${result.skipped.length} change(s) could not be applied.)`;
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);
      if (result.applied.length > 0) {
        onBoardChange(result.board);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
      } else {
        setError("The assistant could not answer. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <aside
        aria-label="AI assistant"
        aria-hidden={!open}
        inert={!open}
        className={`fixed bottom-4 right-4 z-20 w-[min(320px,calc(100vw-2rem))] origin-bottom-right overflow-hidden rounded-3xl border border-(--stroke) bg-white/95 shadow-(--shadow) backdrop-blur transition-all duration-300 ease-in-out xl:sticky xl:inset-auto xl:top-0 xl:z-auto xl:h-screen xl:shrink-0 xl:origin-center xl:rounded-none xl:border-0 xl:border-l xl:bg-white/70 ${
          open
            ? "xl:w-80"
            : "invisible scale-50 opacity-0 xl:w-0 xl:scale-100 xl:border-l-0"
        }`}
      >
        {/* Never taller than the window, so the header stays reachable when zoomed in. */}
        <div className="flex h-[min(30rem,calc(100dvh-2rem))] flex-col xl:h-full xl:w-80">
          <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-(--secondary-purple) text-white shadow-[0_8px_20px_rgba(117,57,145,0.35)]"
              >
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold leading-tight text-foreground">
                  AI assistant
                </h2>
                <div className="mt-1 h-1 w-8 rounded-full bg-(--accent-yellow)" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Hide"
              title="Hide assistant"
              className="rounded-lg p-2 text-(--gray-text) transition hover:bg-(--surface) hover:text-(--primary-blue)"
            >
              <PanelRightClose aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={logRef}
            role="log"
            aria-label="Conversation"
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-2"
          >
            {messages.length === 0 && (
              <div className="mt-2 rounded-2xl border border-dashed border-(--stroke) bg-background p-5">
                <p className="text-sm font-semibold text-foreground">
                  How can I help with your board?
                </p>
                <p className="mt-2 text-sm leading-6 text-(--gray-text)">
                  Ask me to add, edit, move or delete cards, set priorities, due dates and labels, or rename a column.
                </p>
              </div>
            )}
            {messages.map((message, index) => (
              <p
                key={index}
                data-role={message.role}
                className={`max-w-[88%] whitespace-pre-wrap wrap-break-word px-4 py-2.5 text-sm leading-6 shadow-sm ${
                  message.role === "user"
                    ? "self-end rounded-2xl rounded-br-md bg-(--primary-blue) text-white"
                    : "self-start rounded-2xl rounded-bl-md border border-(--stroke) bg-white text-foreground"
                }`}
              >
                {message.content}
              </p>
            ))}
            {loading && (
              <div
                role="status"
                className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-(--stroke) bg-white px-4 py-3 shadow-sm"
              >
                <span className="sr-only">Thinking...</span>
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    aria-hidden="true"
                    style={{ animationDelay: `${delay}ms` }}
                    className="h-2 w-2 animate-bounce rounded-full bg-(--secondary-purple)/60"
                  />
                ))}
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700"
              >
                {error}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-(--stroke) bg-white p-2 shadow-sm transition focus-within:border-(--primary-blue) focus-within:shadow-[0_0_0_3px_rgba(32,157,215,0.15)]">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onKeyDown={handleKeyDown}
                onChange={(event) => setInput(event.target.value)}
                aria-label="Message"
                placeholder="Ask the assistant..."
                className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-(--gray-text)"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send"
                title="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--secondary-purple) text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <ArrowUp aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </aside>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show AI assistant"
        className={`fixed bottom-4 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-(--secondary-purple) text-white shadow-[0_12px_28px_rgba(117,57,145,0.45)] transition-all duration-300 ease-in-out hover:brightness-110 ${
          open ? "invisible scale-50 opacity-0" : ""
        }`}
      >
        <Sparkles aria-hidden="true" className="h-6 w-6" />
      </button>
    </>
  );
};

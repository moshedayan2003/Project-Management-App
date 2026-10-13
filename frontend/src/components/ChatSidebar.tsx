"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { api, ApiError, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

// Four lines of text (24px each) plus the box padding; beyond this the box scrolls.
const MAX_INPUT_HEIGHT = 108;

const SparkleIcon = ({ className }: { className: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm7 11l.9 2.6L22.5 16l-2.6.9L19 19.5l-.9-2.6-2.6-.9 2.6-.9L19 13zM6 15l.7 2.3L9 18l-2.3.7L6 21l-.7-2.3L3 18l2.3-.7L6 15z" />
  </svg>
);

type ChatSidebarProps = {
  onBoardChange: (board: BoardData) => void;
  onUnauthorized: () => void;
};

export const ChatSidebar = ({
  onBoardChange,
  onUnauthorized,
}: ChatSidebarProps) => {
  const [open, setOpen] = useState(true);
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
      const result = await api.chat(text, history);
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
        className={`fixed bottom-4 right-4 z-20 w-[min(360px,calc(100vw-2rem))] origin-bottom-right overflow-hidden rounded-3xl border border-(--stroke) bg-white/95 shadow-(--shadow) backdrop-blur transition-all duration-300 ease-in-out xl:sticky xl:inset-auto xl:top-0 xl:z-auto xl:h-screen xl:shrink-0 xl:origin-center xl:rounded-none xl:border-0 xl:border-l xl:bg-white/70 ${
          open
            ? "xl:w-90"
            : "invisible scale-50 opacity-0 xl:w-0 xl:scale-100 xl:border-l-0"
        }`}
      >
        <div className="flex h-120 flex-col xl:h-full xl:w-90">
          <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-(--secondary-purple) text-white shadow-[0_8px_20px_rgba(117,57,145,0.35)]"
              >
                <SparkleIcon className="h-5 w-5" />
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
              className="rounded-full border border-(--stroke) bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-(--gray-text) transition hover:border-(--primary-blue) hover:text-(--primary-blue)"
            >
              Hide
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
                  Ask me to add, edit, move or delete cards, or rename a column.
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
                className="rounded-xl bg-(--secondary-purple) px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-40"
              >
                Send
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
        <SparkleIcon className="h-6 w-6" />
      </button>
    </>
  );
};

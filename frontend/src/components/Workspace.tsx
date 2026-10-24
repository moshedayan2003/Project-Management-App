"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, LogOut, UserRound } from "lucide-react";
import { AccountDialog } from "@/components/AccountDialog";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { KanbanBoard } from "@/components/KanbanBoard";
import { api, ApiError, type BoardSummary, type User } from "@/lib/api";

const headerButtonClass =
  "flex shrink-0 items-center gap-2 rounded-full border border-(--stroke) px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-(--gray-text) transition hover:border-(--primary-blue) hover:text-(--primary-blue)";

// The last opened board, so a reload opens it again. Storage can be unavailable
// (private windows, blocked site data); then the first board opens.
const STORAGE_KEY = "pm-board";
const rememberedBoard = () => {
  try {
    return Number(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 0;
  }
};
const rememberBoard = (boardId: number) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(boardId));
  } catch {}
};

type WorkspaceProps = {
  user: User;
  onLogout: () => void;
};

// The signed-in app: header with the board switcher and account menu, then the open board.
export const Workspace = ({ user, onLogout }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);

  // A 401 means the session is gone: go back to the login form.
  const fail = (err: unknown, message: string) => {
    if (err instanceof ApiError && err.status === 401) {
      onLogout();
    } else {
      setError(message);
    }
  };

  const select = (id: number | null) => {
    setBoardId(id);
    setError("");
    if (id !== null) {
      rememberBoard(id);
    }
  };

  useEffect(() => {
    api.listBoards().then(
      (list) => {
        setBoards(list);
        const saved = rememberedBoard();
        select(list.some((board) => board.id === saved) ? saved : (list[0]?.id ?? null));
      },
      (err) => fail(err, "Could not load your boards.")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (name: string) => {
    try {
      const created = await api.createBoard(name);
      setBoards((current) => [...(current ?? []), created]);
      select(created.id);
    } catch (err) {
      fail(err, "Could not create the board.");
    }
  };

  const handleRename = async (name: string) => {
    if (boardId === null) return;
    try {
      const renamed = await api.renameBoard(boardId, name);
      setBoards((current) =>
        (current ?? []).map((board) => (board.id === renamed.id ? renamed : board))
      );
    } catch (err) {
      fail(err, "Could not rename the board.");
    }
  };

  const handleDelete = async () => {
    const current = boards?.find((board) => board.id === boardId);
    if (!current || !window.confirm(`Delete "${current.name}" and all its cards?`)) {
      return;
    }
    try {
      await api.deleteBoard(current.id);
      const rest = (boards ?? []).filter((board) => board.id !== current.id);
      setBoards(rest);
      select(rest[0]?.id ?? null);
    } catch (err) {
      fail(err, "Could not delete the board.");
    }
  };

  const header = (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-(--stroke) bg-white/80 px-5 py-3 shadow-(--shadow) backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--navy-dark) text-white"
          >
            <LayoutGrid className="h-4 w-4" />
          </span>
          <h1 className="hidden font-display text-xl font-semibold leading-tight text-foreground md:block">
            Kanban Studio
          </h1>
          {boards && (
            <BoardSwitcher
              boards={boards}
              currentId={boardId}
              onSelect={select}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            className={headerButtonClass}
            aria-label={`Account settings for ${user.username}`}
          >
            <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="max-w-32 truncate normal-case tracking-normal">{user.username}</span>
          </button>
          <button type="button" onClick={onLogout} className={headerButtonClass}>
            <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      )}
      {accountOpen && (
        <AccountDialog
          username={user.username}
          onClose={() => setAccountOpen(false)}
          onDeleted={onLogout}
        />
      )}
    </>
  );

  if (boardId === null) {
    return (
      <main className="flex min-h-screen flex-col gap-4 px-4 py-4 sm:px-5">
        {header}
        <div className="m-auto flex max-w-sm flex-col items-center gap-2 text-center">
          {boards === null ? (
            !error && <p className="text-sm text-(--gray-text)">Loading boards...</p>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-foreground">
                No boards yet
              </h2>
              <p className="text-sm text-(--gray-text)">
                Use the + button at the top to create your first board.
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  // key: a different board starts with fresh state (including its own chat).
  return <KanbanBoard key={boardId} boardId={boardId} header={header} onLogout={onLogout} />;
};

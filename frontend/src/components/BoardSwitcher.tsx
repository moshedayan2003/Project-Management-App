import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { BoardSummary } from "@/lib/api";

const iconButtonClass =
  "rounded-lg p-2 text-(--gray-text) transition hover:bg-(--surface) hover:text-(--primary-blue)";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  currentId: number | null;
  onSelect: (boardId: number) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
};

export const BoardSwitcher = ({
  boards,
  currentId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  // Creating or renaming swaps the picker for a name field.
  const [mode, setMode] = useState<"pick" | "create" | "rename">("pick");
  const [name, setName] = useState("");
  const current = boards.find((board) => board.id === currentId);

  const start = (next: "create" | "rename") => {
    setName(next === "rename" && current ? current.name : "");
    setMode(next);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    await (mode === "create" ? onCreate : onRename)(name.trim());
    setMode("pick");
  };

  if (mode !== "pick") {
    return (
      <form onSubmit={handleSubmit} className="flex min-w-0 items-center gap-1">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setMode("pick")}
          aria-label="Board name"
          placeholder="Board name"
          maxLength={60}
          autoFocus
          className="min-w-0 rounded-full border border-(--stroke) bg-white px-3 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-(--primary-blue)"
        />
        <button
          type="submit"
          aria-label={mode === "create" ? "Create board" : "Save board name"}
          title={mode === "create" ? "Create" : "Save"}
          className={iconButtonClass}
        >
          <Check aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMode("pick")}
          aria-label="Cancel"
          title="Cancel"
          className={iconButtonClass}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </form>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      {current && (
        <select
          value={current.id}
          onChange={(event) => onSelect(Number(event.target.value))}
          aria-label="Board"
          className="min-w-0 max-w-56 truncate rounded-full border border-(--stroke) bg-white px-3 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-(--primary-blue)"
        >
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => start("create")}
        aria-label="New board"
        title="New board"
        className={iconButtonClass}
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
      </button>
      {current && (
        <>
          <button
            type="button"
            onClick={() => start("rename")}
            aria-label="Rename board"
            title="Rename board"
            className={iconButtonClass}
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete board"
            title="Delete board"
            className={`${iconButtonClass} hover:text-red-600`}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
};

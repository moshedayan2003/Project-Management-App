"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { api, ApiError } from "@/lib/api";
import { moveCard, type BoardData } from "@/lib/kanban";

// Drop where the pointer is. closestCorners alone compares rectangle corners, so a card in a
// neighbouring column can beat the column under the pointer (notably an empty column).
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCorners(args);
};

type KanbanBoardProps = {
  onLogout: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const update = (change: (current: BoardData) => BoardData) =>
    setBoard((current) => (current ? change(current) : current));

  // A 401 means the session is gone: go back to the login form.
  const fail = (err: unknown, message: string) => {
    if (err instanceof ApiError && err.status === 401) {
      onLogout();
      return true;
    }
    setError(message);
    return false;
  };

  useEffect(() => {
    api.getBoard().then(setBoard, (err) => fail(err, "Could not load the board."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a change that is already shown; if it fails, show the server's board again.
  const persist = async (call: () => Promise<unknown>) => {
    try {
      await call();
      setError("");
    } catch (err) {
      if (!fail(err, "Could not save your change. The board was reloaded.")) {
        api.getBoard().then(setBoard, () => setError("Could not reach the server."));
      }
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const cardId = active.id as string;
    const columns = moveCard(board.columns, cardId, over.id as string);
    if (columns === board.columns) {
      return;
    }
    setBoard({ ...board, columns });
    const target = columns.find((column) => column.cardIds.includes(cardId));
    if (target) {
      persist(() => api.moveCard(cardId, target.id, target.cardIds.indexOf(cardId)));
    }
  };

  // Typing only changes the shown title; it is saved when the input loses focus.
  const handleRenameColumn = (columnId: string, title: string) => {
    update((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleRenameCommit = (columnId: string, title: string) => {
    persist(() => api.renameColumn(columnId, title));
  };

  const handleAddCard = async (columnId: string, title: string, details: string) => {
    try {
      setBoard(await api.createCard(columnId, title, details));
      setError("");
    } catch (err) {
      fail(err, "Could not add the card.");
    }
  };

  const handleUpdateCard = (cardId: string, title: string, details: string) => {
    update((current) => ({
      ...current,
      cards: { ...current.cards, [cardId]: { id: cardId, title, details } },
    }));
    persist(() => api.updateCard(cardId, title, details));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    update((current) => ({
      ...current,
      cards: Object.fromEntries(
        Object.entries(current.cards).filter(([id]) => id !== cardId)
      ),
      columns: current.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    }));
    persist(() => api.deleteCard(cardId));
  };

  if (!board) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 text-sm text-(--gray-text)">
        {error || "Loading board..."}
      </main>
    );
  }

  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <div className="relative overflow-clip">
      <div className="pointer-events-none absolute left-0 top-0 h-105 w-105 -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,rgba(32,157,215,0.25)_0%,rgba(32,157,215,0.05)_55%,transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-130 w-130 translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,rgba(117,57,145,0.18)_0%,rgba(117,57,145,0.05)_55%,transparent_75%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-475 flex-col xl:flex-row">
      <main className="flex min-w-0 flex-1 flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-4xl border border-(--stroke) bg-white/80 p-8 shadow-(--shadow) backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-(--gray-text)">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-foreground">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-(--gray-text)">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-(--stroke) px-4 py-2 text-xs font-semibold uppercase tracking-wide text-(--gray-text) transition hover:text-foreground"
              >
                Log out
              </button>
              <div className="hidden rounded-2xl border border-(--stroke) bg-background px-5 py-4 2xl:block">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-(--gray-text)">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-(--primary-blue)">
                One board. Five columns. Zero clutter.
              </p>
            </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-(--stroke) px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground"
              >
                <span className="h-2 w-2 rounded-full bg-(--accent-yellow)" />
                {column.title}
              </div>
            ))}
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

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onRenameCommit={handleRenameCommit}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onUpdateCard={handleUpdateCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-65">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
      <ChatSidebar onBoardChange={setBoard} onUnauthorized={onLogout} />
      </div>
    </div>
  );
};

import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onRenameCommit: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onUpdateCard: (cardId: string, title: string, details: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onRenameCommit,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "@container flex min-w-0 flex-col rounded-3xl border border-(--stroke) bg-(--surface-strong)/80 p-3 shadow-[0_4px_16px_rgba(3,33,71,0.06)] transition",
        isOver && "ring-2 ring-(--accent-yellow)"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center gap-2 px-1">
        <span className="h-2 w-2 shrink-0 rounded-full bg-(--accent-yellow)" />
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          onBlur={(event) => onRenameCommit(column.id, event.target.value)}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-0.5 font-display text-sm font-semibold text-foreground outline-none @[12rem]:text-base transition focus:bg-(--surface)"
          aria-label="Column title"
        />
        <span
          className="shrink-0 rounded-full bg-(--surface) px-2 py-0.5 text-xs font-semibold text-(--gray-text)"
          aria-label={`${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
        >
          {cards.length}
        </span>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-2">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onUpdate={onUpdateCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-(--stroke) px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-(--gray-text)">
            Drop a card here
          </div>
        )}
        <NewCardForm
          onAdd={(title, details) => onAddCard(column.id, title, details)}
        />
      </div>
    </section>
  );
};

import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Pencil, Trash2 } from "lucide-react";
import type { Card } from "@/lib/kanban";

const iconButtonClass =
  "rounded-lg p-1.5 text-(--gray-text) transition hover:bg-(--surface)";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onUpdate: (cardId: string, title: string, details: string) => void;
};

export const KanbanCard = ({ card, onDelete, onUpdate }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ title: card.title, details: card.details });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setDraft({ title: card.title, details: card.details });
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      return;
    }
    onUpdate(card.id, draft.title.trim(), draft.details.trim());
    setIsEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative rounded-2xl border border-transparent bg-white p-3 shadow-[0_8px_18px_rgba(3,33,71,0.07)]",
        "transition-all duration-150 hover:border-(--stroke) hover:shadow-[0_12px_24px_rgba(3,33,71,0.1)]",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...(isEditing ? {} : listeners)}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, title: event.target.value }))
            }
            aria-label="Card title"
            className="w-full rounded-xl border border-(--stroke) bg-white px-2.5 py-1.5 text-sm font-medium text-foreground outline-none transition focus:border-(--primary-blue)"
            required
          />
          <textarea
            value={draft.details}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, details: event.target.value }))
            }
            aria-label="Card details"
            rows={3}
            className="w-full resize-none rounded-xl border border-(--stroke) bg-white px-2.5 py-1.5 text-xs leading-5 text-(--gray-text) outline-none transition focus:border-(--primary-blue)"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-(--secondary-purple) px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-(--stroke) px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-(--gray-text) transition hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* With a mouse the icons appear on hover, over the title's corner; on touch
              screens they always show, so the title leaves room for them. */}
          <h4 className="wrap-break-word font-display text-sm font-semibold leading-5 text-foreground pointer-coarse:pr-14">
            {card.title}
          </h4>
          <div className="absolute right-1.5 top-1.5 flex items-center rounded-lg bg-white/95 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
            <button
              type="button"
              onClick={startEditing}
              className={clsx(iconButtonClass, "hover:text-(--primary-blue)")}
              aria-label={`Edit ${card.title}`}
              title="Edit"
            >
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className={clsx(iconButtonClass, "hover:text-red-600")}
              aria-label={`Delete ${card.title}`}
              title="Delete"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
          {card.details && (
            <p className="mt-1.5 wrap-break-word text-xs leading-5 text-(--gray-text)">
              {card.details}
            </p>
          )}
        </>
      )}
    </article>
  );
};

import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import { parseLabels, type Card, type CardFields, type Priority } from "@/lib/kanban";

const iconButtonClass =
  "rounded-lg p-1.5 text-(--gray-text) transition hover:bg-(--surface)";
const fieldClass =
  "w-full rounded-xl border border-(--stroke) bg-white px-2.5 py-1.5 text-xs text-foreground outline-none transition focus:border-(--primary-blue)";
const chipClass = "rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4";

const priorityChip: Record<Priority, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-(--surface) text-(--gray-text)",
};

// "Nov 1", with the year only when it is not this year.
const formatDate = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
};

type Draft = { title: string; details: string; priority: string; due_date: string; labels: string };

const toDraft = (card: Card): Draft => ({
  title: card.title,
  details: card.details,
  priority: card.priority ?? "",
  due_date: card.due_date ?? "",
  labels: card.labels.join(", "),
});

type KanbanCardProps = {
  card: Card;
  overdue: boolean;
  onDelete: (cardId: string) => void;
  onUpdate: (cardId: string, fields: CardFields) => void;
};

export const KanbanCard = ({ card, overdue, onDelete, onUpdate }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(card));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setDraft(toDraft(card));
    setIsEditing(true);
  };

  const change = (field: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      return;
    }
    onUpdate(card.id, {
      title: draft.title.trim(),
      details: draft.details.trim(),
      priority: (draft.priority || null) as Priority | null,
      due_date: draft.due_date || null,
      labels: parseLabels(draft.labels),
    });
    setIsEditing(false);
  };

  const hasMeta = card.priority || card.due_date || card.labels.length > 0;

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
            onChange={change("title")}
            aria-label="Card title"
            className={clsx(fieldClass, "text-sm font-medium")}
            required
          />
          <textarea
            value={draft.details}
            onChange={change("details")}
            aria-label="Card details"
            rows={3}
            className={clsx(fieldClass, "resize-none leading-5 text-(--gray-text)")}
          />
          {/* Side by side only when the column is wide enough to show the whole date. */}
          <div className="grid gap-2 @[15rem]:grid-cols-2">
            <select
              value={draft.priority}
              onChange={change("priority")}
              aria-label="Priority"
              className={fieldClass}
            >
              <option value="">No priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input
              type="date"
              value={draft.due_date}
              onChange={change("due_date")}
              aria-label="Due date"
              className={fieldClass}
            />
          </div>
          <input
            value={draft.labels}
            onChange={change("labels")}
            aria-label="Labels"
            placeholder="Labels, comma separated"
            className={fieldClass}
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
          {hasMeta && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {card.priority && (
                <span className={clsx(chipClass, priorityChip[card.priority])}>
                  {card.priority[0].toUpperCase() + card.priority.slice(1)}
                </span>
              )}
              {card.due_date && (
                <span
                  className={clsx(
                    chipClass,
                    "flex items-center gap-1",
                    overdue ? "bg-red-600 text-white" : "bg-(--surface) text-(--gray-text)"
                  )}
                  title={overdue ? "Overdue" : "Due date"}
                  data-testid="due-date"
                >
                  <CalendarDays aria-hidden="true" className="h-3 w-3" />
                  {formatDate(card.due_date)}
                  {overdue && <span className="sr-only"> (overdue)</span>}
                </span>
              )}
              {card.labels.map((label, index) => (
                <span
                  key={`${index}-${label}`}
                  className={clsx(chipClass, "bg-(--primary-blue)/10 text-(--primary-blue)")}
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
};

import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="h-full rotate-1 cursor-grabbing rounded-2xl border border-(--stroke) bg-white p-3 shadow-[0_18px_32px_rgba(3,33,71,0.16)]">
    <h4 className="wrap-break-word font-display text-sm font-semibold leading-5 text-foreground">
      {card.title}
    </h4>
    {card.details && (
      <p className="mt-1.5 wrap-break-word text-xs leading-5 text-(--gray-text)">
        {card.details}
      </p>
    )}
  </article>
);

import React from "react";
import { ArrowUp, ArrowDown, Trash2, GripVertical } from "lucide-react";

interface DragDropListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDelete: (index: number) => void;
  showControls?: boolean;
  className?: string;
}

export function DragDropList<T>({
  items,
  renderItem,
  onMoveUp,
  onMoveDown,
  onDelete,
  showControls = true,
  className = "",
}: DragDropListProps<T>) {
  return (
    <div className={className}>
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-3">
          {showControls && (
            <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <GripVertical className="h-4 w-4" />
            </span>
          )}

          <div className="flex-1">{renderItem(item, index)}</div>

          {showControls && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMoveUp(index)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
                aria-label="Monter"
                title="Monter"
                disabled={index === 0}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onMoveDown(index)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
                aria-label="Descendre"
                title="Descendre"
                disabled={index === items.length - 1}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                aria-label="Supprimer"
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

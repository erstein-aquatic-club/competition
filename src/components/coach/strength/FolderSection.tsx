import React, { useState, useRef, useEffect } from "react";
import { ChevronRight, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FolderSectionProps {
  name: string;
  count: number;
  children: React.ReactNode;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onCopy?: () => void;
  defaultOpen?: boolean;
}

export function FolderSection({
  name,
  count,
  children,
  onRename,
  onDelete,
  onCopy,
  defaultOpen = false,
}: FolderSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    } else {
      setEditName(name);
    }
    setEditing(false);
  };

  const cancelRename = () => {
    setEditName(name);
    setEditing(false);
  };

  return (
    <div>
      {/* Header row */}
      <div
        className={cn(
          "flex items-center gap-1 rounded-xl px-2 py-1.5 cursor-pointer select-none hover:bg-muted/50"
        )}
        onClick={() => {
          if (!editing) setOpen((prev) => !prev);
        }}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />

        {editing ? (
          <Input
            ref={inputRef}
            className="h-7 text-sm rounded-lg flex-1"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            onBlur={commitRename}
          />
        ) : (
          <span className="text-sm font-semibold truncate">{name}</span>
        )}

        {!editing && (
          <span className="text-xs text-muted-foreground">({count})</span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Menu */}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-40 p-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                setEditName(name);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Rename
            </button>
            {onCopy && (
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  onCopy();
                }}
              >
                <Copy className="h-4 w-4" />
                Copier vers...
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Children */}
      {open && <div className="ml-4">{children}</div>}
    </div>
  );
}

import React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  Archive,
  EllipsisVertical,
  FolderInput,
  Pencil,
  Play,
  RotateCcw,
  Share2,
  Trash2,
} from "lucide-react";
import { Empty, EmptyHeader, EmptyDescription } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { ShareMenuInline } from "@/components/shared/ShareMenu";
import type { SharePayload } from "@/lib/share/types";

interface SessionListViewProps<T extends { id: number }> {
  sessions: T[];
  isLoading?: boolean;
  error?: Error | null;
  renderTitle: (session: T) => React.ReactNode;
  renderMetrics: (session: T) => React.ReactNode;
  renderExtraActions?: (session: T) => React.ReactNode;
  onPreview: (session: T) => void;
  onEdit: (session: T) => void;
  onArchive?: (session: T) => void;
  onDelete: (session: T) => void;
  canDelete: (sessionId: number) => boolean;
  isDeleting?: boolean;
  onMove?: (session: T) => void;
  buildSharePayload?: (session: T) => Promise<SharePayload>;
  archiveMode?: "archive" | "restore";
}

export function SessionListView<T extends { id: number }>({
  sessions,
  isLoading,
  error,
  renderTitle,
  renderMetrics,
  onPreview,
  onEdit,
  onArchive,
  onDelete,
  canDelete,
  isDeleting,
  onMove,
  buildSharePayload,
  archiveMode = "archive",
}: SessionListViewProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`skeleton-${i}`} className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-3/4 mb-1.5" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold">Impossible de charger les données</h3>
        <p className="text-sm text-muted-foreground mt-2">
          {error instanceof Error ? error.message : "Une erreur s'est produite"}
        </p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Empty className="py-6 border-0 bg-muted rounded-xl">
        <EmptyHeader>
          <EmptyDescription>Aucune séance trouvée.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const deleteAllowed = canDelete(session.id);

        return (
          <Card
            key={session.id}
            className="rounded-xl border-border transition-colors active:bg-muted/50"
          >
            <div className="flex items-center gap-2 p-3">
              {/* Tap area: preview on click */}
              <button
                type="button"
                onClick={() => onPreview(session)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
              >
                <div className="text-sm font-semibold leading-snug">
                  {renderTitle(session)}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {renderMetrics(session)}
                </div>
              </button>

              {/* Quick edit */}
              <button
                type="button"
                onClick={() => onEdit(session)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Modifier"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>

              {/* More actions dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Actions"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => onPreview(session)}>
                    <Play className="h-4 w-4" />
                    Aperçu
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(session)}>
                    <Pencil className="h-4 w-4" />
                    Modifier
                  </DropdownMenuItem>
                  {buildSharePayload && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Share2 className="h-4 w-4" />
                        Partager
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <ShareMenuInline onOpen={() => buildSharePayload(session)} />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  {onMove && (
                    <DropdownMenuItem onClick={() => onMove(session)}>
                      <FolderInput className="h-4 w-4" />
                      Déplacer
                    </DropdownMenuItem>
                  )}
                  {onArchive && (
                    <DropdownMenuItem onClick={() => onArchive(session)}>
                      {archiveMode === "restore" ? (
                        <RotateCcw className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                      {archiveMode === "restore" ? "Restaurer" : "Archiver"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(session)}
                    disabled={!deleteAllowed || isDeleting}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleteAllowed ? "Supprimer" : "Utilisée (assignation)"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

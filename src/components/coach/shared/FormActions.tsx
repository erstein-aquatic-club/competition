import React from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Play, Save, UserPlus } from "lucide-react";

interface FormActionsProps {
  isEditing: boolean;
  isSaving?: boolean;
  saveDisabled?: boolean;
  onSave: () => void;
  onCancel: () => void;
  onPreview?: () => void;
  onSaveAndAssign?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  deleteDialogTitle?: string;
  deleteDialogDescription?: string;
  archiveDialogTitle?: string;
  archiveDialogDescription?: string;
  pendingArchive?: boolean;
  onArchiveConfirm?: () => void;
  onArchiveCancel?: () => void;
  pendingDelete?: boolean;
  onDeleteConfirm?: () => void;
  onDeleteCancel?: () => void;
}

export function FormActions({
  isEditing,
  isSaving,
  saveDisabled,
  onSave,
  onCancel,
  onPreview,
  onDelete,
  canDelete = true,
  deleteDialogTitle = "Supprimer ?",
  deleteDialogDescription = "Cette action est définitive.",
  archiveDialogTitle = "Archiver ?",
  archiveDialogDescription = "L'élément sera masqué.",
  pendingArchive,
  onArchiveConfirm,
  onArchiveCancel,
  pendingDelete,
  onDeleteConfirm,
  onDeleteCancel,
  onSaveAndAssign,
}: FormActionsProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Retour"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-base font-semibold">Édition</div>
        </div>
        <div className="flex items-center gap-2">
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
              aria-label="Aperçu nageur"
              title="Aperçu nageur"
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          {onSaveAndAssign && (
            <button
              type="button"
              onClick={onSaveAndAssign}
              disabled={isSaving || saveDisabled}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15 disabled:opacity-50"
              aria-label="Enregistrer et assigner"
              title="Enregistrer et assigner"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Enreg. &amp; assigner
            </button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={isSaving || saveDisabled}
            className="h-10 rounded-full"
          >
            <Save className="h-4 w-4" /> Sauver
          </Button>
        </div>
      </div>

      {pendingArchive !== undefined && onArchiveConfirm && onArchiveCancel && (
        <AlertDialog open={pendingArchive} onOpenChange={(open) => !open && onArchiveCancel()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{archiveDialogTitle}</AlertDialogTitle>
              <AlertDialogDescription>{archiveDialogDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={onArchiveConfirm}>Archiver</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {pendingDelete !== undefined && onDeleteConfirm && onDeleteCancel && (
        <AlertDialog open={pendingDelete} onOpenChange={(open) => !open && onDeleteCancel()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
              <AlertDialogDescription>{deleteDialogDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={onDeleteConfirm}>Supprimer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

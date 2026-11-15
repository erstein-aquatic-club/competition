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

/**
 * Confirmation avant suppression d'un cycle / dossier de séances muscu
 * (audit robustesse muscu, lot 2). Avant : un tap dans le menu supprimait
 * immédiatement. Les séances ne sont pas supprimées (FK `ON DELETE SET NULL`)
 * mais sortent du cycle — et donc du plan du nageur.
 */
interface ConfirmFolderDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** « cycle » (plan nageur) ou « dossier » (catalogue). */
  noun: "cycle" | "dossier";
  name: string;
  itemCount: number;
  /** Nature du contenu : séances (cycles, dossiers de séances) ou exercices. */
  item?: FolderItem;
  onConfirm: () => void;
}

type FolderItem = "séance" | "exercice";

const ITEM_FORMS: Record<FolderItem, { one: string; many: string; pronoun: [string, string]; deleted: [string, string] }> = {
  séance: { one: "La séance", many: "séances", pronoun: ["elle sort", "elles sortent"], deleted: ["supprimée", "supprimées"] },
  exercice: { one: "L'exercice", many: "exercices", pronoun: ["il sort", "ils sortent"], deleted: ["supprimé", "supprimés"] },
};

export function folderDeleteDescription(
  noun: "cycle" | "dossier",
  itemCount: number,
  item: FolderItem = "séance",
): string {
  if (itemCount === 0) return `Ce ${noun} est vide. Cette action est définitive.`;
  const f = ITEM_FORMS[item];
  const one = itemCount === 1;
  const subject = one ? `${f.one} qu'il contient` : `Les ${itemCount} ${f.many} qu'il contient`;
  return `${subject} ne ${one ? "sera" : "seront"} pas ${f.deleted[one ? 0 : 1]}, mais ${f.pronoun[one ? 0 : 1]} de ce ${noun}. Cette action est définitive.`;
}

export function ConfirmFolderDeleteDialog({
  open,
  onOpenChange,
  noun,
  name,
  itemCount,
  item = "séance",
  onConfirm,
}: ConfirmFolderDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer « {name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            {folderDeleteDescription(noun, itemCount, item)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Supprimer le {noun}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

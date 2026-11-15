import { CloudOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

/**
 * État « chargement impossible » avec relance — distinct d'un état vide.
 *
 * Règle : un échec réseau ne doit jamais s'afficher comme « aucun plan » /
 * « pas de bilan ». Construit sur `EmptyState` pour rester dans le langage
 * visuel existant (icône, titre, description, CTA).
 */
interface QueryErrorStateProps {
  title: string;
  description: string;
  onRetry: () => void;
  isRetrying?: boolean;
  compact?: boolean;
  className?: string;
}

export function QueryErrorState({
  title,
  description,
  onRetry,
  isRetrying = false,
  compact = false,
  className,
}: QueryErrorStateProps) {
  return (
    <EmptyState
      compact={compact}
      className={className}
      icon={<CloudOff />}
      title={title}
      description={description}
      cta={
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          onClick={onRetry}
          disabled={isRetrying}
          className="rounded-xl"
        >
          <RotateCcw
            className={cn(
              "mr-1.5 h-4 w-4",
              isRetrying && "animate-spin motion-reduce:animate-none",
            )}
          />
          {isRetrying ? "Chargement…" : "Réessayer"}
        </Button>
      }
    />
  );
}

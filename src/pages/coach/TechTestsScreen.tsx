import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { FlaskConical, Bell, CheckCircle2, AlertTriangle, XCircle, Info, ChevronLeft } from "lucide-react";

interface Props {
  onBack: () => void;
}

/**
 * §385 — Page d'essais techniques (admin only). Bac à sable pour tester
 * rapidement des comportements UI sur appareil réel — d'abord les toasts
 * (pilule iOS, calés sous la Dynamic Island). Extensible au besoin.
 */
export default function TechTestsScreen({ onBack }: Props) {
  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Retour
        </Button>
        <h1 className="text-lg font-bold text-foreground">Essais techniques</h1>
      </div>

      <section className="rounded-2xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-foreground">Toasts</h2>
            <p className="text-xs text-muted-foreground">Vérifier le style pilule et le positionnement sous la Dynamic Island.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => toast("Ceci est un toast de test")}
            className="gap-2"
          >
            <FlaskConical className="h-4 w-4" />
            Test toast
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => toast.success("Opération réussie")}>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Succès
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => toast.error("Une erreur est survenue")}>
            <XCircle className="h-4 w-4 text-destructive" />
            Erreur
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => toast.warning("Attention, vérifie ceci")}>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Alerte
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              toast("Sauvegarde en attente", {
                description: "Renvoi automatique dès le retour réseau.",
              })
            }
          >
            <Info className="h-4 w-4 text-primary" />
            Avec description
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              toast("Action requise", {
                action: { label: "Réessayer", onClick: () => toast.success("Réessayé") },
              })
            }
          >
            <Bell className="h-4 w-4" />
            Avec bouton
          </Button>
        </div>
      </section>
    </div>
  );
}

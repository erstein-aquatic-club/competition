import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { AlertCircle, Clock } from "lucide-react";

type AwaitingApprovalProps = {
  mode?: "pending" | "verification-error";
};

export default function AwaitingApproval({ mode = "pending" }: AwaitingApprovalProps) {
  const logout = useAuth((s) => s.logout);
  const isPending = mode === "pending";

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-6">
        {isPending ? (
          <Clock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
        ) : (
          <AlertCircle className="h-10 w-10 text-amber-600 dark:text-amber-400" />
        )}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {isPending ? "En attente de validation" : "Verification indisponible"}
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        {isPending
          ? "Votre compte est en attente de validation par un responsable du club. Vous serez notifie des que votre acces sera active."
          : "Nous n'avons pas pu verifier l'etat de validation de votre compte pour le moment. Par precaution, l'acces reste bloque jusqu'a confirmation de votre statut."}
      </p>
      <Button variant="outline" className="mt-8" onClick={() => logout()}>
        Se déconnecter
      </Button>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Clock } from "lucide-react";

export default function AwaitingApproval() {
  const logout = useAuth((s) => s.logout);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-6">
        <Clock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
      </div>
      <h1 className="text-2xl font-display font-bold uppercase italic">En attente de validation</h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        Votre compte est en attente de validation par un responsable du club.
        Vous serez notifié dès que votre accès sera activé.
      </p>
      <Button variant="outline" className="mt-8" onClick={() => logout()}>
        Se déconnecter
      </Button>
    </div>
  );
}

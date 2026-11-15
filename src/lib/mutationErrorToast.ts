import { toast } from "sonner";

/**
 * §395 (audit muscu 2ᵉ passe, O2) — il n'y a pas de gestion d'erreur globale des
 * mutations (`queryClient.ts`) : chaque `useMutation` doit afficher son échec.
 */

/** Message lisible : celui de l'erreur s'il existe, sinon le repli fourni. */
export function mutationErrorDescription(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/** Handler `onError` prêt à l'emploi : toast destructif titre + description. */
export function mutationErrorToast(title: string, fallback = "Rien n'a été enregistré. Vérifie ta connexion, puis réessaie.") {
  return (err: unknown) => {
    toast.error(title, { description: mutationErrorDescription(err, fallback) });
  };
}

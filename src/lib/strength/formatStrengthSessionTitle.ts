/**
 * Libellé court destiné aux cartes/lecteurs « Mon plan ».
 *
 * Les imports manuels de novembre 2026 ont nommé les modèles :
 *   "EAC 19/12/2026 | 2026-11-10 | Force haut — reprise"
 * Ce préfixe technique (source + date) ne doit pas prendre la place du nom de
 * la séance sur un petit écran. Il est conservé tel quel dans la DB.
 *
 * Les titres ordinaires du générateur ne sont pas modifiés.
 */
export function formatStrengthSessionTitle(value: string): string {
  const title = value
    .trim()
    .replace(
      /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*[—–\-:]\s*/i,
      "",
    )
    .trim();

  // Délimiteurs et date ISO obligatoires : ne pas retirer un préfixe qui
  // n'est pas l'empreinte reconnue d'une séance importée.
  const imported = title.match(/^[^|]+\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*(.+)$/);
  return imported ? imported[1].trim() : title;
}

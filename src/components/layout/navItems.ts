import { Waves, Target, User, Dumbbell, FileText, Users, CalendarDays, Library, Home, Timer, UserCircle, type LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

export const getNavItemsForRole = (role: string | null): NavItem[] => {
  const normalizedRole = role ?? "athlete";
  if (normalizedRole === "admin") {
    return [
      { href: "/coach", icon: Home, label: "Home" },
      { href: "/coach?section=week", icon: CalendarDays, label: "Semaine" },
      { href: "/coach?section=swimmers", icon: Users, label: "Nageurs" },
      { href: "/coach?section=library", icon: Library, label: "Biblio" },
      { href: "/coach?section=chrono", icon: Timer, label: "Chrono" },
      { href: "/strength", icon: Dumbbell, label: "Ma muscu" },
    ];
  }
  if (normalizedRole === "comite") {
    return [
      { href: "/administratif", icon: FileText, label: "Administratif" },
      { href: "/profile", icon: User, label: "Profil" },
      { href: "/comite", icon: Users, label: "Comité" },
    ];
  }
  if (normalizedRole === "coach") {
    return [
      { href: "/coach", icon: Home, label: "Home" },
      { href: "/coach?section=week", icon: CalendarDays, label: "Semaine" },
      { href: "/coach?section=swimmers", icon: Users, label: "Nageurs" },
      { href: "/coach?section=library", icon: Library, label: "Biblio" },
      { href: "/coach?section=chrono", icon: Timer, label: "Chrono" },
      { href: "/strength", icon: Dumbbell, label: "Ma muscu" },
    ];
  }
  return [
    { href: "/natation", icon: Waves, label: "Natation" },
    { href: "/strength", icon: Dumbbell, label: "Muscu" },
    { href: "/", icon: Home, label: "Home" },
    { href: "/suivi", icon: Target, label: "Suivi" },
    { href: "/profile", icon: User, label: "Profil" },
  ];
};

// §271 — Bottom-nav mobile (≤ md) pour coach/admin :
// - inclut "Profil" (le header sticky desktop n'existe pas sur mobile,
//   donc Profil doit être accessible directement dans le dock).
// - exclut "Chrono" (accessible via la tuile du hub Coach pour libérer
//   un slot et éviter la surcharge du bottom-nav à 6 boutons).
// - conserve "Ma muscu" pour que le coach lance sa séance perso depuis
//   n'importe où.
// Pour les autres rôles, identique au desktop.
export const getMobileNavItemsForRole = (role: string | null): NavItem[] => {
  const normalizedRole = role ?? "athlete";
  if (normalizedRole === "coach" || normalizedRole === "admin") {
    return [
      { href: "/coach", icon: Home, label: "Home" },
      { href: "/coach?section=week", icon: CalendarDays, label: "Semaine" },
      { href: "/coach?section=swimmers", icon: Users, label: "Nageurs" },
      { href: "/coach?section=library", icon: Library, label: "Biblio" },
      { href: "/strength", icon: Dumbbell, label: "Ma muscu" },
      { href: "/profile", icon: UserCircle, label: "Profil" },
    ];
  }
  return getNavItemsForRole(normalizedRole);
};

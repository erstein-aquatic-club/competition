import { Waves, Target, User, Dumbbell, FileText, Users, CalendarDays, Library, Home, Timer, type LucideIcon } from "lucide-react";

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

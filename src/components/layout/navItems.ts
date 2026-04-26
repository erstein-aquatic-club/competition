import { Waves, Target, User, Dumbbell, FileText, Users, CalendarDays, Library, Home, Timer, type LucideIcon } from "lucide-react";
import { FEATURES } from "@/lib/features";

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
  const athleteItems: NavItem[] = [
    { href: "/natation", icon: Waves, label: "Natation" },
  ];

  if (FEATURES.strength) {
    athleteItems.push({ href: "/strength", icon: Dumbbell, label: "Muscu" });
  }

  athleteItems.push({ href: "/", icon: Home, label: "Home" });
  athleteItems.push({ href: "/suivi", icon: Target, label: "Suivi" });
  athleteItems.push({ href: "/profile", icon: User, label: "Profil" });

  return athleteItems;
};

type NotificationLinkInput = {
  type?: string | null;
  title?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function resolveNotificationHref(notification: NotificationLinkInput): string {
  const title = String(notification.title ?? "").toLowerCase();
  const message = String(notification.message ?? "").toLowerCase();
  const type = String(notification.type ?? "").toLowerCase();
  const haystack = `${title} ${message}`;

  if (type === "interview" || haystack.includes("entretien")) {
    return "/suivi?tab=entretiens";
  }

  if (type === "wellness" || haystack.includes("bien-être") || haystack.includes("te sens-tu")) {
    return "/?wellness=open";
  }

  if (type === "assignment") {
    return "/";
  }

  if (type === "objective" || haystack.includes("objectif")) {
    return "/suivi?tab=objectifs";
  }

  // Fallback: check metadata URL (strip leading # for Wouter compatibility)
  const metadataUrl = notification.metadata?.url;
  if (typeof metadataUrl === "string" && metadataUrl.trim()) {
    const cleaned = metadataUrl.trim().replace(/^#/, "");
    return cleaned || "/profile?section=messages";
  }

  return "/profile?section=messages";
}

export function resolveNotificationActionLabel(notification: NotificationLinkInput): string | null {
  const href = resolveNotificationHref(notification);
  if (href === "/suivi?tab=entretiens") return "Ouvrir l'entretien";
  if (href === "/suivi?tab=objectifs") return "Ouvrir les objectifs";
  if (href === "/?wellness=open") return "Remplir mon bien-être";
  if (href === "/") return "Ouvrir l'accueil";
  if (href === "/profile?section=messages") return null;
  return "Ouvrir";
}

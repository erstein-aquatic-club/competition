# Messages Redesign — iOS Mail Light Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Épurer les deux vues "Messages" (nageur et coach) — accordion inline, suppression des Cards, mobile-first.

**Architecture:** Refonte purement visuelle sur deux composants existants + ajout d'un helper pur `formatRelativeDate` dans `src/lib/date.ts`. Aucune migration DB, aucun nouveau composant, logique métier inchangée.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide icons, date-fns (déjà installé)

---

## Task 1 — Helper `formatRelativeDate`

**Files:**
- Modify: `src/lib/date.ts`
- Test: `src/lib/__tests__/date.test.ts`

### Step 1 — Écrire les tests (ils doivent échouer)

Ajouter à la fin de `src/lib/__tests__/date.test.ts` :

```typescript
import { formatRelativeDate } from "@/lib/date";

// Helper : fabrique une date ISO à N minutes dans le passé depuis `now`
function minutesAgo(n: number, now: Date) {
  return new Date(now.getTime() - n * 60_000).toISOString();
}
function hoursAgo(n: number, now: Date) {
  return new Date(now.getTime() - n * 3_600_000).toISOString();
}

const NOW = new Date("2026-05-08T14:00:00Z");

test("formatRelativeDate — moins d'une heure → 'il y a Xm'", () => {
  assert.equal(formatRelativeDate(minutesAgo(5, NOW), NOW), "il y a 5m");
  assert.equal(formatRelativeDate(minutesAgo(59, NOW), NOW), "il y a 59m");
});

test("formatRelativeDate — moins de 24h → 'il y a Xh'", () => {
  assert.equal(formatRelativeDate(hoursAgo(2, NOW), NOW), "il y a 2h");
  assert.equal(formatRelativeDate(hoursAgo(23, NOW), NOW), "il y a 23h");
});

test("formatRelativeDate — hier → 'hier'", () => {
  // La veille au même créneau
  const yesterday = new Date("2026-05-07T14:00:00Z").toISOString();
  assert.equal(formatRelativeDate(yesterday, NOW), "hier");
});

test("formatRelativeDate — moins de 7 jours → abréviation du jour", () => {
  // 3 jours avant (sam. 2026-05-05)
  const d = new Date("2026-05-05T10:00:00Z").toISOString();
  assert.equal(formatRelativeDate(d, NOW), "mar.");
});

test("formatRelativeDate — plus de 7 jours → jj/mm", () => {
  const d = new Date("2026-04-20T10:00:00Z").toISOString();
  assert.equal(formatRelativeDate(d, NOW), "20/04");
});

test("formatRelativeDate — date invalide → string brut", () => {
  assert.equal(formatRelativeDate("not-a-date", NOW), "not-a-date");
});
```

### Step 2 — Lancer les tests pour vérifier qu'ils échouent

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "formatRelativeDate"
```

Attendu : erreur `formatRelativeDate is not a function` ou équivalent.

### Step 3 — Implémenter `formatRelativeDate` dans `src/lib/date.ts`

Ajouter à la fin du fichier :

```typescript
const DAY_ABBRS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function formatRelativeDate(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);

  if (diffMin < 60) return `il y a ${diffMin}m`;
  if (diffH < 24) return `il y a ${diffH}h`;

  // Comparer les dates calendaires locales
  const todayStr = toISODate(now);
  const dateStr = toISODate(date);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = toISODate(yesterdayDate);

  if (dateStr === yesterdayStr) return "hier";

  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) return DAY_ABBRS[date.getDay()];

  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}
```

### Step 4 — Lancer les tests pour vérifier qu'ils passent

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "formatRelativeDate"
```

Attendu : 6 tests `✓ formatRelativeDate …`

### Step 5 — Commit

```bash
git add src/lib/date.ts src/lib/__tests__/date.test.ts
git commit -m "feat(§196): helper formatRelativeDate pour les vues messages"
```

---

## Task 2 — Refonte `SwimmerMessagesView`

**Files:**
- Modify: `src/components/profile/SwimmerMessagesView.tsx` (357 lignes actuellement)

**Aucun fichier de test à créer** — la logique métier (mark-read, dismiss, clear-all) n'est pas modifiée ; seul le rendu change.

### Step 1 — Remplacer les imports

Changer le bloc imports au sommet du fichier.

Actuel (ligne 1-16) :
```typescript
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/api";
import {
  filterVisibleNotifications,
  getDismissedUnreadTargetIds,
  persistDismissedNotificationTargetIds,
  readDismissedNotificationTargetIds,
} from "@/lib/notificationsVisibility";
import { resolveNotificationActionLabel, resolveNotificationHref } from "@/lib/notificationRouting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BellRing, ChevronRight, Dot, Inbox, ArrowLeft, Trash2 } from "lucide-react";
```

Remplacer par :
```typescript
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/api";
import {
  filterVisibleNotifications,
  getDismissedUnreadTargetIds,
  persistDismissedNotificationTargetIds,
  readDismissedNotificationTargetIds,
} from "@/lib/notificationsVisibility";
import { resolveNotificationActionLabel, resolveNotificationHref } from "@/lib/notificationRouting";
import { formatRelativeDate } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Inbox, ArrowLeft, Trash2, X } from "lucide-react";
```

### Step 2 — Ajouter `handleDismissOne` juste après `handleClearAll` (après la ligne 193)

```typescript
const handleDismissOne = (targetId: number) => {
  setDismissedTargetIds((current) => Array.from(new Set([...current, targetId])));
};
```

### Step 3 — Remplacer le JSX retourné (tout ce qui est dans le `return`)

Remplacer depuis la ligne `return (` jusqu'à la fin du fichier par :

```tsx
  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-display font-semibold uppercase italic text-primary">
            Messages
          </h2>
          {notifications.filter((n) => !n.read).length > 0 ? (
            <Badge className="rounded-full px-1.5 py-0 text-[11px] leading-5 h-5">
              {notifications.filter((n) => !n.read).length}
            </Badge>
          ) : null}
        </div>
        {notifications.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => { void handleClearAll(); }}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Tout effacer</span>
          </Button>
        ) : null}
      </div>

      {/* Loading skeletons */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-14 rounded-xl border bg-card/60 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : null}

      {/* Empty state */}
      {!isLoading && notifications.length === 0 ? (
        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-primary/5">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                {hiddenNotificationCount > 0 ? "Tous les messages sont masqués ici" : "Aucun message pour le moment"}
              </p>
              <p className="text-sm text-muted-foreground">
                {hiddenNotificationCount > 0
                  ? "La home n'affichera plus ces messages comme non lus. Vous pouvez les réafficher sur cet appareil si besoin."
                  : "Les notifications du coach et les rappels automatiques apparaîtront ici."}
              </p>
            </div>
            {hiddenNotificationCount > 0 ? (
              <Button variant="outline" size="sm" onClick={handleRestoreHiddenNotifications}>
                Réafficher les messages masqués
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* List */}
      {notifications.length > 0 ? (
        <div className="space-y-1">
          {notifications.map((notification) => {
            const isExpanded = notification.target_id === selectedNotification?.target_id;
            const actionLabel = resolveNotificationActionLabel(notification);
            const isUnread = !notification.read;

            return (
              <div
                key={notification.target_id ?? notification.id}
                className={`group rounded-xl transition-colors ${
                  isUnread ? "bg-primary/8" : "bg-transparent"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleNotificationPress(notification)}
                  className="w-full px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
                >
                  <div className="flex items-start gap-3">
                    {/* Unread dot */}
                    <div className="mt-1.5 shrink-0 w-2">
                      {isUnread ? (
                        <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(227,6,19,0.1)]" />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${isUnread ? "font-semibold" : "font-normal text-muted-foreground"}`}>
                          {notification.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelativeDate(notification.date)}
                        </span>
                      </div>
                      {!isExpanded ? (
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                          {notification.message || "Aucun détail supplémentaire."}
                        </p>
                      ) : null}
                    </div>

                    {/* Dismiss button */}
                    {notification.target_id != null ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismissOne(notification.target_id!);
                        }}
                        className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        aria-label="Masquer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </button>

                {/* Inline expanded content */}
                {isExpanded ? (
                  <div className="mx-3 mb-3 rounded-xl border border-border/60 bg-card p-3 space-y-2">
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {notification.message || "Aucun détail supplémentaire."}
                    </p>
                    {actionLabel ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => {
                          void selectNotification(notification);
                          openNotificationDestination(notification);
                        }}
                      >
                        {actionLabel}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
```

### Step 4 — Vérifier le type check

```bash
npx tsc --noEmit 2>&1 | grep SwimmerMessagesView
```

Attendu : aucune erreur sur ce fichier.

### Step 5 — Vérifier les tests globaux

```bash
npm test 2>&1 | tail -5
```

Attendu : même nombre de tests verts qu'avant (aucun test n'existe sur SwimmerMessagesView).

### Step 6 — Commit

```bash
git add src/components/profile/SwimmerMessagesView.tsx
git commit -m "feat(§196): SwimmerMessagesView — accordion inline, header épuré, dismiss par item"
```

---

## Task 3 — Refonte `CoachMessagesScreen`

**Files:**
- Modify: `src/pages/coach/CoachMessagesScreen.tsx` (264 lignes actuellement)

### Step 1 — Remplacer les imports

Actuel (lignes 1-11) :
```typescript
import { useEffect, useMemo, useState } from "react";
import { BellRing, SendHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CoachSectionHeader from "./CoachSectionHeader";
```

Remplacer par :
```typescript
import { useEffect, useMemo, useState } from "react";
import { BellRing, SendHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

### Step 2 — Remplacer le JSX retourné

Remplacer tout le `return (...)` (à partir de la ligne `return (`) par :

```tsx
  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div>
        {onBack ? (
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour
          </Button>
        ) : null}
        <h2 className="text-xl font-display font-semibold uppercase italic text-primary">
          Envoyer un message
        </h2>
      </div>

      {/* Destinataire */}
      <div className="space-y-1.5">
        <Label htmlFor="coach-msg-target">Destinataire</Label>
        <Select value={targetValue} onValueChange={setTargetValue}>
          <SelectTrigger id="coach-msg-target">
            <SelectValue placeholder={athletesLoading ? "Chargement..." : "Choisir un nageur ou un groupe"} />
          </SelectTrigger>
          <SelectContent>
            {groupOptions.length ? (
              <>
                <SelectItem value="section-group" disabled>Groupes</SelectItem>
                {groupOptions.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </>
            ) : null}
            {athleteOptions.length ? (
              <>
                <SelectItem value="section-athlete" disabled>Nageurs</SelectItem>
                {athleteOptions.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </>
            ) : null}
          </SelectContent>
        </Select>
        {targetValue && selectedTarget.recipients > 0 ? (
          <p className="text-xs text-muted-foreground">
            {selectedTarget.recipients} nageur{selectedTarget.recipients > 1 ? "s" : ""} ciblé{selectedTarget.recipients > 1 ? "s" : ""}
          </p>
        ) : null}
        {targetValue && selectedTarget.recipients === 0 ? (
          <p className="text-xs text-destructive">Aucun nageur actif n'est rattaché à cette sélection.</p>
        ) : null}
      </div>

      {/* Titre */}
      <div className="space-y-1.5">
        <Label htmlFor="coach-message-title">Titre <span className="text-destructive">*</span></Label>
        <Input
          id="coach-message-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. Changement d'horaire demain"
          maxLength={200}
        />
      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <Label htmlFor="coach-message-body">
          Message <span className="text-muted-foreground font-normal">(optionnel)</span>
        </Label>
        <Textarea
          id="coach-message-body"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ajoutez les détails à afficher dans la notification…"
          rows={3}
          maxLength={2000}
        />
      </div>

      {/* CTA sticky */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 p-4 backdrop-blur">
        <Button
          className="w-full"
          onClick={handleSendMessage}
          disabled={!selectedTarget.target || selectedTarget.recipients === 0 || !title.trim() || sending}
        >
          {sending ? (
            <>
              <BellRing className="mr-2 h-4 w-4" />
              Envoi...
            </>
          ) : (
            <>
              <SendHorizontal className="mr-2 h-4 w-4" />
              Envoyer la notification
            </>
          )}
        </Button>
      </div>
    </div>
  );
```

### Step 3 — Ajouter l'import `ArrowLeft` manquant

Dans le bloc imports (ligne `import { BellRing, SendHorizontal }`) :
```typescript
import { ArrowLeft, BellRing, SendHorizontal } from "lucide-react";
```

### Step 4 — Vérifier le type check

```bash
npx tsc --noEmit 2>&1 | grep CoachMessagesScreen
```

Attendu : aucune erreur.

### Step 5 — Lancer les tests globaux

```bash
npm test 2>&1 | tail -5
```

Attendu : même nombre de tests verts qu'avant.

### Step 6 — Commit

```bash
git add src/pages/coach/CoachMessagesScreen.tsx
git commit -m "feat(§196): CoachMessagesScreen — suppression Cards, formulaire épuré mobile-first"
```

---

## Task 4 — Mise à jour docs

**Files:**
- Modify: `docs/implementation-log.md` (ajouter entrée §196)
- Modify: `CLAUDE.md` (mettre à jour "Dernière entrée en date")
- Modify: `docs/claude/files-map.md` (mettre à jour tailles si > 30% de variation)

### Step 1 — Mesurer les tailles finales

```bash
wc -l src/lib/date.ts src/components/profile/SwimmerMessagesView.tsx src/pages/coach/CoachMessagesScreen.tsx
```

### Step 2 — Mettre à jour docs/implementation-log.md

Ajouter une entrée §196 en tête du fichier, après le séparateur du §195 précédent.

### Step 3 — Mettre à jour CLAUDE.md

Remplacer la ligne `Dernière entrée en date : §195` par `Dernière entrée en date : §196`.

### Step 4 — Commit final

```bash
git add docs/implementation-log.md CLAUDE.md docs/claude/files-map.md
git commit -m "docs(§196): implementation-log + CLAUDE.md + files-map"
```

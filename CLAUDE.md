# Claude Code Context — Suivi Natation V2

## Projet

Application web de suivi d'entraînement (natation + musculation) pour l'Erstein Aquatic Club.
4 rôles : nageur (athlete), coach, comité, admin.

## Stack

- **Frontend** : React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI/Shadcn (55 composants), Zustand 5, React Query 5, Wouter (hash routing)
- **Backend** : Supabase (PostgreSQL, Auth, Edge Functions Deno)
- **Déploiement** : GitHub Pages (frontend), Supabase Cloud (backend)
- **Tests** : Vitest, 31 fichiers de tests

## Architecture

- SPA avec hash-based routing (`/#/path`) pour GitHub Pages
- Persistance hybride : Supabase primary, localStorage fallback offline
- Code splitting via React.lazy + Suspense
- Feature flags dans `src/lib/features.ts` (tous activés)

## Fichiers clés

Annuaire détaillé (140+ fichiers) : **`docs/claude/files-map.md`** — à lire quand tu cherches un fichier précis.

### Hubs & orchestrateurs critiques

| Fichier | Rôle |
|---------|------|
| `src/lib/api.ts` | Façade API (stubs → 14 modules) |
| `src/lib/api/index.ts` | Re-exports centralisés |
| `src/lib/api/client.ts` | Supabase client, utilitaires |
| `src/lib/api/types.ts` | Interfaces TypeScript |
| `src/lib/auth.ts` | Gestion auth, session, rôles |
| `src/lib/schema.ts` | Schéma Drizzle (tables) |
| `src/lib/features.ts` | Feature flags |
| `src/pages/Dashboard.tsx` | Calendrier natation nageur |
| `src/pages/SwimmerHome.tsx` | Home nageur |
| `src/pages/Strength.tsx` | Module musculation nageur |
| `src/pages/Coach.tsx` | Hub coach |
| `src/pages/Admin.tsx` | Hub admin |
| `src/hooks/useDashboardState.ts` | Façade dashboard nageur |
| `src/hooks/useCoachCalendarState.ts` | État calendrier coach |
| `src/hooks/useStrengthState.ts` | État muscu |
| `supabase/tests/rls/` | Tests RLS intégration (voir `docs/rls-testing.md`) |

**Pour tout autre fichier**, lire `docs/claude/files-map.md` (annuaire complet).

## Edge Functions Supabase

| Fonction | Statut | Chemin |
|----------|--------|--------|
| `admin-user` | Fonctionnelle (ACTIVE, v97) | `supabase/functions/admin-user/` |
| `ffn-sync` | Fonctionnelle (ACTIVE, v53) — cron sync FFN | `supabase/functions/ffn-sync/` |
| `ffn-performances` | Fonctionnelle (ACTIVE, v64) — capte `club_name` depuis cellule club FFN | `supabase/functions/ffn-performances/` |
| `import-club-records` | Fonctionnelle (ACTIVE, v74) — recalc filtré sur `app_settings.home_club_name` | `supabase/functions/import-club-records/` |
| `push-send` | Fonctionnelle (ACTIVE, v33) | `supabase/functions/push-send/` |

## Documentation

Lire ces fichiers dans cet ordre pour reprendre le contexte :

1. **Ce fichier** (`CLAUDE.md`) — Vue d'ensemble rapide
2. **`docs/FEATURES_STATUS.md`** — Matrice complète des fonctionnalités (ce qui marche, ce qui manque)
3. **`docs/ROADMAP.md`** — Plan de développement futur (4 chantiers détaillés)
4. **`docs/implementation-log.md`** — Historique des implémentations
5. **`docs/patch-report.md`** — Audit UI/UX (items restants)
6. **`README.md`** — Stack, déploiement, structure

## Chantiers

**Historique complet (99 chantiers, tous livrés)** : `docs/ROADMAP.md` + `docs/implementation-log.md`.

Dernière entrée en date : §200+§201 (Tap targets audit massif + migration partielle Surface primitive. Sub-agents sonnet en parallèle pour économie tokens. **§200** — 12 spots tap targets sub-44px corrigés sur 10 fichiers : `CoachPaceCalculatorScreen.tsx` header 3 boutons `h-7` → `h-11` + Switch `scale-[0.7]` retiré (ligne 298) ; `ChronoSetup.tsx` steppers séries+lignes `h-10 w-10` → `h-11 w-11` (×4) ; `WorkoutRunner.tsx` Replace+Exit `h-10 w-10` → `h-11 w-11` (cohérence avec difficulty 44 dans même composant) ; `AthletePlansTab.tsx` action bar `size="sm"` → `size="default"` (×2) ; `WellnessForm.tsx` pills 1-5 `h-10` → `h-11` ; `SlotSessionSheet.tsx:1153` library item ajout `min-h-11` ; `InfoBubble.tsx:30` trigger `p-0.5` → `min-h-11 min-w-11` ; `SwimmerMessagesView.tsx:319` dismiss `h-7 w-7` → `h-9 w-9` (limite mais bouton small-discret) ; `ObjectiveDetailSheet.tsx:69,72` ToggleGroupItem `h-8` → `h-11` ; `SessionRow.tsx:30` `py-2` → `min-h-11 py-2.5` ; `ui/tabs.tsx:14,30` TabsList+TabsTrigger ajout `min-h-11` (préfère min-h pour ne pas casser desktop). Apple HIG strict 44×44px désormais respecté sur tous les chemins critiques restants. **§201** — Migration partielle Surface primitive sur 3 composants : `PushPermissionBanner.tsx` wrapper `rounded-xl border bg-background/95 shadow-lg backdrop-blur` → `<Surface variant="glass" radius="sm" className="shadow-lg p-4..." />` ; `LoginInstallBanner.tsx` wrapper `rounded-xl border border-primary/20 bg-primary/5` → `<Surface variant="tinted" radius="sm" />` (delta intentionnel : `border-primary/15` Surface vs `border-primary/20` original, aligné sur le token) ; `ObjectiveCard.tsx` mode **full uniquement** wrapper `rounded-xl border shadow-sm border-t-[3px]` → `<Surface variant="solid" radius="sm" interactive className="...border-t-[3px] ${topBorder}..." />` (mode `compact` border-l-4 inchangé, trop spécifique pour migration mécanique). **Refusés (raisons techniques)** : `UpdateNotification.tsx` wrapper est un `<motion.div>` framer-motion porteur des props d'animation `initial`/`animate`/`exit`/`transition` ; Surface n'a pas de prop `as`/`asChild`, wrap intermédiaire aurait cassé l'animation, de plus `rounded-full` (pill) non couvert ; `BottomActionBar.tsx` wrapper utilise `rounded-t-2xl` (radius top-only), Surface ne supporte que des radius symétriques, migration aurait produit un rendu non-équivalent. `Surface.tsx` fix collatéral : ajout `import * as React from "react"` pour corriger `ReferenceError` dans env test `node:test` + `renderToString` (problème latent depuis §199 jamais déclenché par les tests existants). 15 fichiers modifiés au total (12 §200 + 4 §201, recouvrement Surface). `npx tsc` clean. 684 tests pass, 1 fail pré-existant `transformers.test.ts` non lié.)

Précédente : §199 (Chantier B — Surface primitive + Sheet drag handle + tokenisation InlineBanner + adoucissement gradients. Suite du plan d'audit §197. **(1) NEW `src/components/shared/Surface.tsx`** (70 LOC) — primitive partagée API `variant: "solid" | "glass" | "tinted" | "outline"` × `radius: "sm"=12px | "md"=16px | "lg"=22px` (radius UISheetPresentationController iOS 16+) + prop `interactive` qui ajoute `active:scale-[0.98]`. Unifiera les ~8 variantes "card-like" recensées dans l'audit (Card shadcn, InlineBanner, ObjectiveCard full+compact, LoginInstallBanner, PushPermissionBanner, BottomActionBar, UpdateNotification). Posée pour migration progressive §200+, pas encore déployée sur les call-sites. **(2) `ui/sheet.tsx` variant `bottom`** : ajout par défaut `rounded-t-[22px]` + `pb-[max(1.5rem,env(safe-area-inset-bottom))]` (safe-area home indicator iPhone). Avant : aucun radius par défaut, chaque call-site improvisait (`rounded-t-2xl` SwimmerHome:557, `rounded-t-3xl` ObjectiveDetailSheet:53, rien Profile:741). Drag handle visuel : barre 36×4 (`h-1 w-9 bg-muted-foreground/30`) rendue en absolute top-2, centered, uniquement quand `side="bottom"`. Pattern UISheetPresentationController iOS 16+ — signal visuel de dismissable au swipe. **(3) `InlineBanner.tsx` tokenisation** — 7 variants color hardcoded (-25 hardcodes, top contributeur audit shared) → 5 variants sémantiques iOS-aligned `info/success/warning/error/muted` consommant `--color-status-success/warning/error` + `--color-primary`. Alias back-compat conservés (`amber → warning`, `red → error`, `yellow → warning`, `blue → info`, `emerald → success`, `destructive → error`) pour ne casser aucun call-site existant. Migration progressive vers les variants sémantiques en §200+. **(4) `SwimmerHome.tsx` Section E (Messages coach)** refondu : Card violet baroque `bg-gradient-to-br from-violet-50/50 to-purple-50/30 dark:from-violet-950/20 dark:to-purple-950/10` + `border-violet-200/60` + badge MessageCircle custom + 3 niveaux de div imbriqués (~30 lignes JSX) → 1 seul `<InlineBanner variant="info" icon={<MessageCircle/>} label badge sublabel onClick />`. -22 lignes nettes, cohérent avec Section B (WellnessBanner) et Section D (compétition InlineBanner amber). **(5) `WorkoutRunner.tsx` cards focus charge/reps** : `border-2 border-primary/20 bg-gradient-to-br from-card to-muted/30 shadow-sm` → `border border-border bg-secondary` plat (gradient cassait visuellement en dark mode, signalé dans audit nageur). Hover/active : `hover:border-primary/40 hover:shadow-md` → `hover:bg-secondary/80`. Section labels Charge/Reps/Difficulté `text-[10px] font-bold` → `text-[11px] font-semibold` (alignement audit shared : 11px minimum lisibilité iOS). 5 fichiers modifiés. `npx tsc` clean, 683 tests pass + 1 fail pré-existant non lié.)

Précédente : §198 (Quick Wins QW1-QW8 du plan d'audit UX. (QW1) AppLayout : doublon `OfflineBanner` retiré, on garde `OfflineDetector` (pill flottant plus iOS) + `OfflineSyncBanner` (rôle distinct : signaler sync de mutations). (QW2) SwimSessionView : `window.confirm("Retirer cette séance de votre feed ?")` → `AlertDialog` Radix avec state `removeConfirmOpen`, pattern §181. (QW3) Sticky CTA safe-area sur 3 fichiers : SwimSessionView (`bottom-6` → `bottom-[max(1.5rem,env(safe-area-inset-bottom))]`), CompetitionDetail + ChronoSetup (`pb-[max(0.75rem,env(safe-area-inset-bottom))]`) — le CTA ne mange plus l'home indicator iPhone notch + Dynamic Island. (QW4) Tap targets header → ≥ 44px : Dashboard Records/Hebdo (`h-8` → `min-h-11 md:min-h-9`), SwimmerHome avatar (wrapper `h-11 w-11 rounded-full active:scale-95` + Avatar `h-11 w-11`), CoachCommentsScreen + CoachMessagesScreen back buttons (custom `h-8 w-8` retiré → bascule sur le default 44px du variant `size="icon"` Button). (QW5) ScaleSelector5 → tokens `--color-intensity-{1..5}` : remplacement du mono-rouge primary par un mapping value 1→5 sur les tokens (emerald → green → yellow → orange → red). Restaure le canal visuel d'intensité que le composant prétendait offrir (audit shared : "valeur 1 et valeur 5 avaient la même couleur"). Ajout `active:scale-95`. (QW6) Helper `formatRelativeTime` dupliqué dans `Coach.tsx:207-216` + `CoachCommentsScreen.tsx:29-38` (mêmes ~10 lignes de logique) → unifié sur `formatRelativeDate` de `lib/date.ts` (créé §196), ajoute "hier"/"lun."/"jj/mm" — formatage plus iOS-aligned. (QW7) Dashboard Settings dialog `max-w-[340px]` → `max-w-[calc(100vw-32px)] sm:max-w-[360px]` — ne déborde plus iPhone SE viewport 320px (audit nageur). (QW8) Profile push toggle Button "Off"/"On" cryptique → `<Switch checked={pushEnabled} onCheckedChange={...}>` avec `aria-label` dynamique, pattern UISwitch iOS standard. 11 fichiers modifiés. `npx tsc` clean.)

Précédente : §197 (Audit UI/UX iOS-like complet livré dans `docs/audits/2026-05-08-ui-ux-audit-ios.md` — 3 forks parallèles ciblant surfaces nageur, coach, composants partagés ; 25+ surfaces auditées contre la grille iOS HIG. Verdict global 6/10. **3 drapeaux rouges racines** identifiés : (1) `src/index.css:278-285` forçait `h1-h6 = font-display uppercase italic` + `button = uppercase tracking-wide bold` sur **toute** l'app, créant une perception "agence 2018 / club sportif rétro" alors que le contenu produit est bon ; (2) tap targets sub-44px endémiques (~25 spots avec `h-7`/`h-8`/`h-9`/`h-10` sur boutons critiques) coexistant avec des spots déjà à 44px depuis §172/§181 → écrans schizophréniques ; (3) **94 fichiers .tsx** utilisent des classes hardcoded `bg-amber-500`/`text-emerald-600`/`border-rose-200` alors que les tokens sémantiques existent (`--color-status-*`, `--color-intensity-{1..5}`, `--color-tag-{swim,educ}`, `--color-rank-{gold,silver,bronze}`) — top 5 contributeurs `CoachTrainingSlotsScreen` (55), `Coach.tsx` (34), **`InlineBanner` (25)** ironique, `AthletePlansTab` (22), `CoachSwimmersOverview` (21). Plan d'action : 5 chantiers structurels A-E + 8 quick wins, chemin critique ~8-10 jours. **Chantier A livré** dans le même § : détox typo globale. (a) `src/index.css` — retrait des @apply globaux `h1-h6 { font-display uppercase italic }` et `button { uppercase tracking-wide bold }`, remplacement par base douce `h1-h6 { font-semibold tracking-tight }` (sentence-case Inter, hiérarchie typo conservée par les `text-Nxl` ad-hoc) + nouvelles utility opt-in `.heading-display` / `.btn-eac-display` pour brand moments futurs. (b) `PageHeader.tsx` — titre `font-display uppercase italic text-primary` → `font-semibold tracking-tight text-foreground truncate`, subtitle `text-[10px]` → `text-xs`. (c) Détox de **17 call-sites** avec `font-display uppercase italic` explicite local — Dashboard "Accueil", SwimSessionView "Détails", Profile hero nom user, Comité, Admin, Administratif, RecordsAdmin (×2), CoachMessagesScreen, CoachSectionHeader (partagé, impact transversal), CoachGroupsScreen, CoachTrainingSlotsScreen, SwimCatalog preview, SwimmerMessagesView "Messages", SwimmerObjectivesView "Mon plan", AthletePerformanceHub "Mon suivi", AthleteInterviewsSection "Mes entretiens", FeedbackDrawer day label + WorkoutRunner finish button (texte source `"ENREGISTRER & FERMER"` tapé en majuscules brutes → `"Enregistrer & fermer"`, classe `text-lg font-bold uppercase` → `text-base font-semibold`). Pattern uniforme `text-Nxl font-display font-bold uppercase italic text-primary` → `text-Nxl font-semibold tracking-tight text-foreground`. Brand moments préservés (`AppLayout` logo `SUIVI<NATATION>`, `AwaitingApproval`, `ComingSoon`, `SharedSwimSession`, `WorkoutRunner.tsx:751` "Séance terminée !", `SessionSummary.tsx:58`, `RecordsClub.tsx:415` label discret). **Cascade automatique majeure** : tous les `<Button>` shadcn (100+ CTA dans l'app) basculent de `font-bold uppercase tracking-wide` (via la règle globale supprimée) à `font-medium` sentence-case (via leur variant par défaut `ui/button.tsx:8`) — détoxifiés sans intervention manuelle. Aussi `WellnessForm.tsx:252` heures sommeil en `font-display` numerique → italic uppercase plus appliqué donc lisibilité numérique restaurée. 20 fichiers modifiés. `npx tsc --noEmit` clean. 683 tests pass, 1 fail pré-existant `transformers.test.ts` non lié. Quick Wins QW1-QW8 (banner doublon Offline, sticky CTA safe-area, audit massif tap targets sub-44, ScaleSelector tokens intensity, etc.) et Chantiers B-E (Surface primitive, tokens sémantiques, CoachPageHeader/EmptyState/SystemBannerStack, IosSheet) à venir §198+.)

Précédente : §196 (Redesign "iOS Mail light" des deux vues Messages. Vue nageur `SwimmerMessagesView` : suppression card détail fixe → accordion inline au tap, header épuré (badge non-lus, trash icon-only), dismiss par item (bouton X absolu hors bouton principal + e.stopPropagation), unreadCount useMemo. Vue coach `CoachMessagesScreen` : suppression 3 Cards, champs directs dans la page. NEW helper pur `formatRelativeDate` dans `src/lib/date.ts` (il y a Xm/Xh/hier/lun./jj/mm, guard date future, TZ comment, 7 tests). 683 tests, 1 fail pré-existant. `npx tsc` clean.)

Précédente : §195 (Fix duplication note coach ↔ note athlète dans `RestScreen` (vue focus muscu, écran de repos) **+ cleanup affichage "note coach" côté athlète**. Plainte utilisateur : "quand j'ajoute un commentaire athlete sur mon temps de pause en vue athlete focus, le texte se duplique dans la zone notes coach". Cause racine localisée à `WorkoutRunner.tsx:1122-1123` : les deux props `note` (destinée à la note coach, affichée sous "Note coach" dans `RestExerciseTab.tsx`) et `athleteNote` (destinée à la note personnelle athlète, affichée sous "Ma note") lisaient la **même source** `exerciseNotes?.[currentBlock?.exercise_id ?? -1]`. Or `exerciseNotes` est dérivé exclusivement de `one_rm_records.notes` (notes athlète, voir `Strength.tsx:353-359` `useMemo`). Quand l'athlète tape dans le textarea "Ma note" → `onUpdateNote(exerciseId, value)` (debounced 800 ms) → mutation `updateNote` → UPDATE `one_rm_records.notes` → `oneRMs` rafraîchi → `exerciseNotes` recalculé → les deux blocs affichent désormais la même valeur. **Fix initial** d'une ligne : `note={currentBlock?.notes ?? null}` au lieu de `note={exerciseNotes?.[...]}`. **Cleanup demandé par l'utilisateur** ("nettoie tous les commentaires coach, pour l'instant il n'y en a pas") : retrait des affichages "Note coach" côté athlète puisque aucun coach ne saisit actuellement de notes par exercice. (1) `WorkoutRunner.tsx:1064` vue focus principale — `{(currentBlock?.notes \|\| currentExerciseDef?.description) && ...}` → `{currentExerciseDef?.description && ...}` (label "Notes" → "Description") ; (2) `RestScreen.tsx` — prop `note` retirée de l'interface + destructuring + passage à `RestExerciseTab` ; (3) `RestExerciseTab.tsx` — prop `note`, import `StickyNote`, bloc JSX "Note coach" (~12 lignes) retirés. La saisie côté builder coach (`StrengthExerciseCard.tsx:160-167` Textarea "Notes" → `StrengthSessionItem.notes`) reste intacte — si un coach commence à utiliser cette feature, l'affichage côté athlète sera trivialement restauré. Tests `RestExerciseTab.test.tsx` (5 tests `node:test`) : suppression du test "renders coach notes" + retrait des `note={null}` des autres. Pas de migration DB. `npx tsc --noEmit` clean. Investigation via `superpowers:systematic-debugging` Phase 1 : trace `Strength.tsx → WorkoutRunner.tsx → RestScreen.tsx → RestExerciseTab.tsx` en 5 reads ciblés, 0 agent spawné.)

Précédente : §194-vagueC (Tag SW per-notif + gate focused contextuel + **fix critique auth 401 push-send**. En vérifiant les logs Edge Function avant déploiement de Vague C, découverte d'une cause racine majeure non identifiée à l'audit initial : tous les appels webhook depuis le trigger pg_net 00044 retournaient **401 systématiquement** depuis plusieurs jours. Cause : la vault key `push_edge_function_key` ne correspondait plus à l'env `SUPABASE_SERVICE_ROLE_KEY` côté Edge Function (rotation, divergence initiale, peu importe). Le check `token === serviceRoleKey` env échouait → fallback `userClient.auth.getUser(token)` échouait aussi (le token n'est pas un user JWT) → 401. **Conséquence** : aucune notif automatique ne déclenchait de push (wellness matin, slot reminder, assignations, interviews, swimmer comments). Seuls les broadcasts coach manuels via `supabase.functions.invoke` (JWT user) fonctionnaient. C'est l'explication structurelle dominante de "pushs pas systématiques" — bien plus impactante que les Vagues B (subscription cleanup 90j, rotation endpoint). **Refactor de l'auth gate** : `decodeJwtPayload(token)` lit le claim `role` du JWT (Supabase a déjà validé la signature via `verify_jwt:true`), `isWebhookCall = role === 'service_role'`. Plus aucune dépendance à l'égalité vault ↔ env. Déployé v35 (vs v33 prod). **Validation prod** : INSERT manuel d'un row `notification_targets` → trigger pg_net fire → push-send répond **200** (1782 ms, vs 401 systématique sur v33). Notif test supprimée immédiatement. Tag unique par notif (`eac-notif-${notifId}` ou `eac-manual-${Date.now()}`) ajouté dans le pushPayload — empêche l'OS d'écraser les pushs rapprochées dans le tray (tag partagé `'eac-notification'` avant : pushs cron wellness 06h00 + slot reminder 06h15 → même tag → l'OS écrase la précédente). NEW helpers purs `extractHashPath(url)` + `pushTargetMatchesClient(clientUrl, targetUrl)` dans `pushHelpers.ts` — gèrent URL pleine avec/sans hash, hash route seul, wellness `/?wellness=open` ↔ `#/`, trailing slash. Logique dupliquée en JS dans `public/push-handler.js` (le SW est servi en JS classique, pas de bundling). **Gate `focused` du SW désormais contextuel** : on n'élide la notif OS que si un client focused est sur la **même hash route** que `data.url` (path comparé sans query) ; sinon affichage systématique. Avant : suppression OS dès qu'un client était focused, peu importe la page → toast in-app §180 disparaît en 5 s, notif facile à rater quand la PWA est ouverte mais que l'utilisateur regarde ailleurs. 15 tests TDD nouveaux (7 extractHashPath, 8 pushTargetMatchesClient). 678 tests total, 677 verts, 1 fail pré-existant `transformers.test.ts` non lié. `npx tsc` clean. Plainte initiale "trop de notifs + pushs pas systématiques" entièrement traitée par les 3 vagues : Vague A (-82 % notifs visibles), Vague B (resync sub auto), Vague C (auth fix + UX SW). Vague D potentielle si besoin d'observabilité serveur sur pg_net.http_response.)

Précédente : §194-vagueB (Resync push subscription auto + reset banner 60 j. Suite logique de §194 Vague A : centre de notifications désormais maîtrisé (-82 %), il restait à fiabiliser la livraison des pushs côté client. Audit avait identifié 3 causes structurelles : (1) `cleanup_expired_notifications` (00085) supprime les `push_subscriptions` dont `updated_at < now - 90j`, et `subscribeToPush` n'est appelé qu'à la 1ʳᵉ activation (banner one-shot dismissable) ou via toggle Profile manuel — aucun rafraîchissement périodique → utilisateurs anciens perdent leur sub silencieusement ; (2) rotation d'endpoint Chrome/Firefox jamais resync en DB tant que l'utilisateur ne touche pas Profile ; (3) `eac-push-banner-dismissed` permanent → si l'utilisateur perd ensuite sa sub par (1) ou (2), aucun moyen de re-prompt. **Solution** : NEW helpers purs `shouldRefreshPushSubscription(now, lastRefreshAt, intervalMs)` + `shouldShowPushBanner(now, dismissedAt, reproposeAfterMs)` dans `pushHelpers.ts` (gèrent null/0/NaN proprement, dismiss legacy sans timestamp = expiré pour migration douce). NEW `refreshPushSubscription(userId)` dans `push.ts` : ne prompt JAMAIS, no-op si permission ≠ granted ou subscription absente, sinon UPSERT pour rafraîchir `updated_at` (cooldown 7j stocké dans `localStorage.eac-push-last-refresh`) + DELETE des autres endpoints du même user (rotation cleanup proactif, en plus du 410 → DELETE existant côté push-send). NEW hook `usePushSubscriptionRefresh` (56 LOC) avec `useRef` anti-rerun monté dans le composant `PushBridge` de `App.tsx` (à côté de `useInAppPushBridge`). `PushPermissionBanner.tsx` écrit désormais `eac-push-banner-dismissed-at` (timestamp) au dismiss et utilise `shouldShowPushBanner` → re-propose après 60j ; les dismiss antérieurs à ce patch (clé seule sans timestamp) sont traités comme expirés à la 1ʳᵉ ouverture après update. 10 tests TDD sur les helpers purs (cooldown 7j, reproposition 60j, edge cases). 663 tests total, 662 verts, 1 fail pré-existant `transformers.test.ts` non lié. `npx tsc` clean. Vague C (tag SW per-notif au lieu de `eac-notification` partagé qui écrase les pushs rapprochées dans le tray, gate `clients[i].focused` contextuelle au lieu de suppression OS systématique) reportée.)

Précédente : §194 (Vague A correctifs centre de notifications. Plainte utilisateur : « trop de notifications tous les jours dans le centre + pushs n'arrivent pas systématiquement ». Audit Phase 1 systematic-debugging a identifié 8 causes racines ; cette livraison attaque les 2 plus rentables côté centre. (1) **Doublon critique supprimé** dans `assignments.ts assignments_create` : le code insérait manuellement `notifications` + `notification_targets` après chaque INSERT `session_assignments`, alors que le trigger SQL `auto_notify_session_assignment` (00045) le fait déjà → chaque assignation muscu via `AthletePlansTab.tsx` créait **2 notifs identiques + 2 pushs**. Bloc 32 LOC retiré, remplacé par commentaire pointant vers le trigger. Le chemin `bulkCreateSlotAssignments` (séances natation) n'avait pas le bug. (2) **Migration 00156** ajoute `expires_at` adapté à chaque type sur les 6 fonctions trigger `auto_notify_*` : `session_assignment` = `scheduled_date + 1d` (fallback `now() + 14d`) ; `competition_assignment` = `start_date + 2d` (fallback `now() + 60d`) ; `slot_override` = `override_date + 1d` ; `interview_created/transition` = `now() + 30d` ; `swimmer_comment` = `now() + 7d`. Backfill `expires_at = created_at + 14d` sur toutes les notifs sans expires_at (§163 avait posé l'expiration sur les CRONS wellness/slot reminder mais pas sur les triggers d'assignation → cumul indéfini, impossibles à purger par `cleanup_expired_notifications` 00085 qui ignore `expires_at IS NULL`). **Effet immédiat prod (project `fscnobivsgornxdwqwlk`) : 278 notifs total, 208 sans expires_at avant → 0 après ; 229 désormais masquées (filtre serveur `notifications_list` ignore `expires_at <= now`) ; 49 toujours visibles ; -82 % de notifs visibles dans le centre.** NEW `src/lib/api/__tests__/assignmentsCreate.test.ts` (138 LOC) : 2 tests régression TDD vérifiant `assignments_create` n'appelle plus que `from('session_assignments')` + propage l'erreur sans tenter de notif manuelle. Vague B (resync push subscriptions au boot pour rafraîchir `updated_at` < 90j, détection rotation endpoint Chrome/Firefox, reset `eac-push-banner-dismissed` après 60j) reportée — à attaquer après mesure du gain Vague A. Vague C (tag SW per-notif au lieu de `eac-notification` partagé qui écrase les pushs rapprochées dans le tray, gate `clients[i].focused` contextuelle au lieu de suppression OS systématique) reportée — modification UX qui mérite §séparé. `notifications_send` (broadcasts coach manuels) volontairement non touché. 652/653 tests, 1 fail pré-existant `transformers.test.ts` non lié. `npx tsc` clean.)

Précédente : §193 (Objectives ↔ compétitions désormais en N:N + multi-select Lier + fix PB 12 mois. Migration 00155 NEW table `objective_competitions(objective_id UUID, competition_id UUID, created_at, PK composite)` avec FK ON DELETE CASCADE des deux côtés + RLS aligné sur les policies existantes de `objectives` + backfill idempotent depuis `objectives.competition_id` (3/3 liens reconstruits). La colonne legacy `objectives.competition_id` est conservée pour back-compat mais plus écrite. API : `Objective.competition_ids: string[]`, NEW `linkObjectiveToCompetition` (UPSERT idempotent) + `unlinkObjectiveFromCompetition`. **Suite de bugs critiques post-livraison résolus** : (1) embed PostgREST `competitions(name, date)` désambiguïsé via FK explicite `competitions!objectives_competition_id_fkey` — la migration introduisait un 2e chemin FK qui rendait l'embed ambigu → query throw silencieuse → 0 objectif partout (Sheet, InfoMyObjectives, profil) ; (2) cache React Query versionnée `["athlete-objectives", authUid]` + bypass `getAthleteObjectives()` async au profit de `api.getObjectives(authUid)` direct depuis le store Zustand ; (3) `useAuth.authUid` exposé synchroniquement dans le store (depuis `session.user.id` dans `loginFromSession` + `loadUser`) ; (4) `computeObjectivePerfRow` utilise `findBestTime` (de `objectiveHelpers.ts`) pour bridger les codes événements format compact `"50NL"` ↔ FFN `"50 NL"`/`"50 Nage Libre"` via `EVENT_CODE_TO_NAMES` — le filtre strict `===` ne matchait jamais, PB et delta affichaient toujours "—". Multi-select dans l'onglet Lier (Checkbox shadcn au lieu de RadioGroup, état `Set<string>`, mutation séquentielle UPSERT idempotent, bouton dynamique "Lier N objectifs"). Diagnostic via panneau debug ambre temporaire (commits c62db9e58 + 8b57729fe puis nettoyé en 73713fd33). Coach `SwimmerObjectivesTab.tsx` non touché (form edit utilise encore la colonne legacy mono-valeur, out-of-scope). 6 commits sur main, 651 tests, 650 verts, 1 fail pré-existant `transformers.test.ts`. `npx tsc` clean.)

Précédente : §192 (Ajout objectif inline sur la vue info compétition. Empty state CTA "Aucun objectif défini" + bouton "+ Objectif" en header de section ouvrent désormais un Sheet bottom à 2 onglets [Créer un nouveau | Lier un existant] au lieu de naviguer vers `/profile?section=objectives`. Onglet "Créer" reproduit le form de `SwimmerObjectivesView` (Type chrono/texte/both, épreuve, bassin, cible m:ss:cc, texte) avec `competition_id` pré-rempli sur la mutation `createObjective`. Onglet "Lier" liste les objectifs du nageur avec `competition_id == null` (helper pur `selectLinkableObjectives` + 4 tests TDD), RadioGroup → `updateObjective(id, { competition_id })` partiel Supabase. Les deux invalident `["athlete-objectives"]` → la table de `InfoMyObjectives` se rafraîchit immédiatement. NEW `src/components/competition/AddObjectiveSheet.tsx` (371 LOC). Modif `InfoMyObjectives.tsx` (138→173) + `CompetitionDetail.tsx` (151→164, ajout `useQuery(["auth-uid"])` qui appelle `supabase.auth.getUser()` pour obtenir l'UUID réel — évite le piège §191 où `useAuth.user` est le displayName, pas l'UUID). 4 commits sur main, 654 tests, 653 verts, 1 fail pré-existant. `npx tsc` clean.)

Précédente : §191 (Vue info compétition — refonte de la landing au tap sur la bannière. `/competition/:id` rend désormais une nouvelle vue info : header (J-X badge + dates + lieu + description) + section adaptée au rôle + CTA sticky "Préparer la compétition →" qui pousse vers `/competition/:id/prep` (où vivent les anciens 4 tabs Check/Courses/Routines/Jour J). Section nageur : table objectifs + PB 12 mois glissants + delta cible (rouge si effort restant, emerald si marge) avec skeleton + empty state CTA `/profile?section=objectives`. Section coach/comité/admin : liste participants triée groupe ASC → nom ASC ("Sans groupe" en queue), avatar + badge "N obj" si > 0, tap → `/profile/:athleteId`. Renommage `src/pages/CompetitionDetail.tsx` (ancien tabs prep) → `src/pages/CompetitionPrep.tsx` ; nouveau `CompetitionDetail.tsx` (150 LOC) prend la place pour la vue info. NEW : `info-helpers.ts` (86 LOC, helpers purs `computeObjectivePerfRow` + `groupAndSortAssignments` avec 10 tests TDD), `InfoMyObjectives.tsx` (138 LOC), `InfoParticipants.tsx` (128 LOC). NEW API `getObjectivesByCompetition`. Route swap dans `App.tsx` (`/prep` BEFORE `/:id`, plus spécifique d'abord). `useRoute` de CompetitionPrep mis à jour vers `/competition/:id/prep` (Wouter pattern exact match). Back arrow de prep → vue info de la même compet (1 tap, plus `window.history.back()`). Exécuté en `superpowers:subagent-driven-development` : 8 tasks, 2 boucles de fix (Task 4 skeleton+tap-target, Task 6 bug critique `useAuth.user`=displayName ≠ UUID corrigé en bascule sur `getAthleteObjectives()` no-arg qui résout l'UUID server-side). Tous les call sites existants (SwimmerHome banner, Dashboard calendrier, push notif `data.url`) atterrissent désormais sur info sans modification. 651 tests, 650 verts, 1 fail pré-existant `transformers.test.ts`. `npx tsc` clean. 8 commits sur main.)

Précédente : §190-ui3 (SwimmerHome — Section D "Prochaine compétition" utilise désormais l'`InlineBanner` partagé du calendrier. Remplacement de la `<Card>` amber custom (Trophy + J-X badge + name + location + ligne meta avec courses/séances/checklist) par un seul `<InlineBanner variant="amber" />` paramétré : `icon={<Trophy />}`, `label={nextCompetition.name}`, `badge="J-X"` ou `"Aujourd'hui"`, `sublabel={location}`, `subbadge="N séance(s)"`. Suppression de l'import `MapPin`, des queries `["competition-races"]` + `["competition-checklist"]`, et du memo `checklistProgress` — la page détail compétition fetchera ces données à la demande au tap. Cohérence visuelle parfaite avec le bandeau dans `Dashboard.tsx` ligne 834. `SwimmerHome.tsx` 710 → 669 LOC. 3 tests inchangés. `npx tsc` clean.)

Précédente : §190-ui2 (SwimmerHome — compteur séances restantes sur card "Prochaine compétition". Réutilise `computeTrainingDaysRemaining` de `lib/date.ts`. Query `["my-planned-absences"]` partagée avec Dashboard via cache react-query, gated `enabled: !!nextCompetition`. `presenceDefaults` lu depuis localStorage avec la même clé que Dashboard, fallback `initPresenceDefaults()` si jamais ouvert le calendrier.)

Précédente : §190-ui (SwimmerHome — "Ma semaine" remplace "Aujourd'hui" sous Bien-être. Suppression du bloc JSX Section C "Aujourd'hui" qui affichait des cards par session du jour avec badges Fait/À faire/Lancer + état "Jour de repos". `SwimmerWeekMatrixCard` déplacée à sa place. La vue détaillée `SwimmerWeekSlots` reste en Section G. Helpers exportés `buildTodaySessionCompletionLookup` + `isTodaySessionLogged` conservés. useMemos + queries de la Section C préservés (cache priming). `SwimmerHome.tsx` ~770 → 673 LOC.)

Précédente : §190-fix3 (Card "Ma semaine" — exclure les séances muscu. Ajout du filtre `row.slot_session_type !== "swim"` dans la boucle d'indexation `byDateBucket`. Les rows strength sont ignorées dès l'indexation, ne comptent ni dans `totalSlots` ni dans `plannedPast/donePast/missedCount`. La muscu reste visible via `MyPlanWeekCard` (côté Strength). 16 tests inchangés. `npx tsc` clean.)

Précédente : §190-fix2 (Card "Ma semaine" — fix régression `log_session_id`. Le RPC `get_swimmer_sessions` migration 00132 retourne `NULL::uuid AS log_session_id` ligne 253 — il ne fait pas de jointure vers la table de sessions loggées. Côté front, `row.log_session_id != null` était toujours `false` → tous les créneaux passés assignés affichaient "ressenti manquant" (l'utilisateur a vu "2 partout" car swim + strength même bucket = 2 lignes RPC, deux flagués missed). Réintroduction de la query `api.getSessions` (clé `["sessions", userId ?? user]` partagée avec SwimmerHome → cache dedupe) + helpers locaux `buildCompletionLookup(sessions)` + `rowHasFeedback(row, lookup)` qui matche par `assignment_id` en priorité avec fallback `(date, bucket)` avec mapping FR `"Matin"/"Soir"` → `"morning"/"evening"`. `SwimmerWeekMatrixCard.tsx` 415 → 459 LOC. 16 tests inchangés. `npx tsc` clean.)

Précédente : §190-fix (Card "Ma semaine" nageur — bascule sur `get_swimmer_sessions` RPC pour résolution per-swimmer. Le §190 initial réutilisait `useSlotCalendar` (résolution group-level), affichant des slots où la séance coach était assignée à un sous-groupe ou nageur individuel ne concernant pas l'utilisateur courant. Nouvelle source : `getSwimmerSessions(userId, mondayIso, sundayIso, false)` — résolution `individual > subgroup > group` + skip `is_absent`. `SwimmerWeekMatrixCard.tsx` 434 → 415 LOC. 16 tests inchangés. `npx tsc` clean.)

Précédente : §190 (Card "Ma semaine" compacte côté nageur — NEW `src/components/shared/swimmerWeekMatrix.ts` (70 LOC, helpers purs `classifyCell` + `foldCellStates` avec 7 états : `none` / `unassigned` / `assigned-future` / `assigned-today` / `done` / `missed-feedback` / `past-no-session`). NEW `src/components/shared/SwimmerWeekMatrixCard.tsx` (grille 7j × matin/aprèm visuellement identique à la matrice coach `Coach.tsx` § B). Footer `{donePast}/{plannedPast} séances faites` + message contextuel ressentis (rose si manquants, emerald si à jour, sky si futur). Tap → `/natation`. Choix produit : conserve `SwimmerWeekSlots` détaillé en-dessous + créneau passé sans séance coach = neutre. `SwimmerHome.tsx` Section G dédoublée. 16 tests TDD.)

Précédente : §189-ext (Drawer objectif unifié Allures + Progression — extraction `EventProgressionContent` de `EventProgressionSheet`, nouveau `ObjectiveDetailSheet.tsx` (Sheet bottom, toggle [Allures|Progression] si cible allure, onglet allures → `PaceMatrixInline`, onglet progression → `EventProgressionContent`). `SwimmerObjectivesView` : suppression inline matrices + `shouldRenderInlineMatrix`, state `detailObj`+`detailMatchingTarget`, helper `openDetail`. +2 tests, −4 tests. `npx tsc` clean.)

Précédente : §188-ext (Sync auto allures ↔ objectifs (§188 extension) — auto-upsert cible allure quand coach sauvegarde un objectif chrono parseable + rattrapage rétroactif au mount. `shouldAutoSyncToPaceTarget` pur dans `objective-pace-link.ts`. `autoSyncPaceTarget` exporté depuis `SwimmerObjectivesTab.tsx`. `syncedForAthleteRef` correctif multi-nageur. +8 tests. `npx tsc` clean.)

Précédente : §188 (Lier objectifs nageur ↔ allures — bouton "→ Allures" 1-clic sur `ObjectiveCard` côté coach (context=coach, désactivé si event_code non-parsable ou temps null) ; handoff via `sessionStorage` (`pace-prefill-handoff.ts`) ; `CoachPaceCalculatorScreen` consomme le prefill au mount via `selectAccordionTargetForPrefill` + `useEffect`, ouvre l'accordéon du nageur et upsert/affiche la cible. Côté nageur : `findMatchingTarget` (pure) + hook `useTargetForObjective` ; `PaceMatrix` reçoit prop `compact` pour masquer le pool toggle ; `PaceMatrixInline` (wrapper compact, nage par alias FR) affiché sous chaque `ObjectiveCard` si match `(swimmer, stroke, distance, pool)` dans `SwimmerObjectivesView`. Aucune migration DB. 13 tests TDD, `npx tsc` clean.)

Précédente : §189 (Chrono setup — équipe coach par défaut + vagues auto par ligne — `src/components/chrono/ChronoSetup.tsx`. Refonte tabs `"club"|"manuals"` → `"team"|"club"`, défaut `"team"`. L'onglet "Mon équipe" liste manuels (section "Mémorisés" en tête, delete inline) + comptes rattachés (groupés par `group_label`). L'onglet "Tout le club" (`disabled` si `allAthletes.length === athletes.length`) remplace l'ex-Switch `showAll`. Recherche partagée filtre simultanément manuels et accounts. NEW `computeNextWave(lane)` = `min(swimmersInLane.length + 1, maxWaves)` utilisé par `handleAddSwimmer` ET `handleAddManual` (extrait de `ManualsTabBody`) à la place du `wave: 1` hardcodé : 1er → V1, 2e → V2, etc., capé maxWaves (2 mobile / 6 desktop). `ManualsTabBody` (107 lignes) supprimé — logique inlinée dans le parent. Imports nettoyés (`Switch`, `useQuery`, `useRef`, `X`). `npx tsc` clean, tous les tests chrono verts.)

Précédente : §186 (Pace Model v2 — refonte non-linéaire du moteur d'allures, rétrospectif. Modèle linéaire §184/§185 → `t_allure(d) = (Tobj × R_base × A_nage + Δ_mesure) / k_allure` du doc métier. 3 migrations DB prod : `00151_pace_model_v2` (DROP+recréation `coach_pace_zones` schema v2 multi-row family×zone + nouvelle table `coach_stroke_adjustments`) ; `00152_pace_share_payload_v2` (RPC zones_v2 jsonb) ; `00153_pace_team_coach_visibility` (RPC `list_manual_swimmers_for_coach`). NEW `paceCalculatorV2.ts` (238 LOC moteur pur), `paceData.ts` (96 LOC R_base/A_nage/k_allure), `Pace4NSegmentMatrix.tsx` (269 LOC), `PaceStrokeAdjustments.tsx` (238 LOC drawer mS), `PdfExportDialog.tsx` (116 LOC), `pdfPalette.ts` (57 LOC), `AddSwimmerToTeamDialog.tsx` (233 LOC refonte Mon équipe). Refonte `PaceMatrix.tsx` (194→268, V4 conditionnel) + `PaceZonesSettings.tsx` (343, schema v2) + `SwimmerPaceCard.tsx` (244, sous-accordions) + `CoachPaceCalculatorScreen.tsx` (220, sélecteur coach) + `SharedPaceMatrix.tsx` + `export-pace-pdf.ts` (906, branding EAC + bassin d'origine). API `pace-zones` v2 + `pace-stroke-adjustments` (49) + `coaches.ts` (30). Hooks `useCoachPaceZonesV2` (71) + `useCoachStrokeAdjustments` (60) + `useTeamForCoach` dans `useMyTeam`. 30+ commits `feat(pace-v2):`, +5337/-773 LOC, 49 fichiers, déployé Pages.)

Précédente : §185 (Bassin 50m/25m sur les cibles d'allures — migration `00150_pace_targets_pool_size` : `target_pool_size text NOT NULL DEFAULT '50m'` sur `coach_pace_targets` + `upsert_pace_target` recréé avec `p_pool_size DEFAULT '50m'` + `get_pace_share_payload` inclut `swimmer_sex`. NEW `src/lib/poolConversion.ts` : table FFN 17 entrées sex-dépendant + `convertTargetTime` + `getPoolMajorationMs` + `FFN_DISCLAIMER`. `PaceTargetForm.tsx` : toggle [50m|25m] inline. `PaceMatrix.tsx` : toggle bassin avec état local `viewPool` + Tooltip disabled + conversion via `convertTargetTime()` + footer disclaimer. `SwimmerPaceCard.tsx` / `CoachPaceCalculatorScreen.tsx` / `SharedPaceMatrix.tsx` / `export-pace-pdf.ts` : passent `target_pool_size` et `swimmerSex`. Phase 10 RLS : 4 nouveaux fichiers de tests, `asAnon()` dans `_helpers.ts`, `schema.sql` mis à jour.)

Précédente : §183 (Export PDF séance pour les nageurs — Refacto `src/lib/export-session-pdf.ts` : remplacement du paramètre `SlotInstance` (typé coach uniquement) par un type générique exporté `SessionHeaderInfo` `{ date, timeRange?, location?, groups?, filenameSlug? }`. `drawMetadataBand` consomme la nouvelle shape avec ignore gracieux des valeurs nulles. Helper `formatTime` renommé en export `formatTimeForPdfHeader`. Nom de fichier dérivé du slug optionnel ou fallback `seance-{YYYYMMDD}.pdf`. `SlotSessionSheet.tsx` (coach) : adapté l'appel existant (mappe `SlotInstance` → `SessionHeaderInfo`, conserve slug `coach-seance-{YYYYMMDD}` pour ne rien casser côté UX coach). `SwimSessionView.tsx` (nageur) : nouveau bouton `FileDown` dans la toolbar à côté du `ShareMenu` (visible uniquement si `assignment` résolu), handler `handleExportPdf` fetch `getSwimSessionById(session_id)` via React Query (clé `["swim-session-preview", sessionId]` partagée avec le coach), mapping `assigned_slot` → "Matin"/"Soir" (pas d'horaire précis dispo nageur), pas de `location`/`groups`. Spinner `Loader2` + toast destructif sur erreur, `setExportingPdf(false)` dans `finally`. Bouton absent dans `SharedSwimSession` par choix produit. Aucun nouveau fichier code. `npx tsc --noEmit` clean, `npm test` 367 pass + 1 fail pré-existant non lié (`transformers.test.ts`).)

Précédente : §182 (Rattrapage tests RLS reportés post-audit robustesse — Phase 1 : fix 5 tests cassés dans `strength_planning.test.ts` cause `asUser` rollback systématique, solution seeds `asServiceRole` + refactor idempotent upsert en transaction unique. Phase 2A : porter migration 00145 `assignments_write` split insert/update/delete dans `supabase/tests/schema.sql` + 7 tests cross-coach (Eve id=5 attaque Carol id=3) dans `session_assignments.test.ts`. Phase 2B : nouvelle fonction stub `_test_save_strength_run_authz` dans test schema (mirror exact migration 00146 IF blocks) + NEW `supabase/tests/rls/save_strength_run_authz.test.ts` (171 LOC, 11 tests). RLS suite 120/125 → 143/143 (+18 tests, 0 régression). Phase 3 reportée §183+ (chrono_records, one_rm_records, push_subscriptions, pain_reports, strength_session_runs cross-athlete, slot_assignments §173 Task 13).)

Précédente : §181 (UX polish post-audit consolidé Opus — WorkoutRunner Replace/Exit buttons h-8→h-10 (40 px), difficulty buttons h-9→h-11 (44 px Apple HIG). SlotSessionSheet sticky CTA py-3→py-3.5. navItems.ts coach/admin 6→5 items (Profil retiré, accessible via avatar UserCircle ajouté dans le sticky header coach de AppLayout.tsx). CoachCommentsScreen markReadMutation passe en optimistic update (onMutate cancelQueries+setQueryData unreadCount=0/is_read mapping, onError rollback prev, onSettled invalidate) → badge home disparaît immédiatement, plus de lag 1-2 s. SlotSessionSheet split_distance window.confirm → AlertDialog Radix (state splitDistanceAlertOpen + Promise resolver dans splitDistanceConfirmRef, 2 boutons Annuler + Assigner quand même destructive). AppLayoutLogic.test.ts assertions mises à jour (5 items, Profil exclu). 367 pass, 1 fail pré-existant transformers.test.ts non lié.)

Précédente : §180 (Foreground push bridge in-app — Service Worker `push-handler.js` envoie `postMessage({type:'eac-push', payload})` aux clients focused (§174 P2) mais aucun listener React ne le consommait → notifs foreground silencieuses. NEW `src/hooks/useInAppPushBridge.ts` (69 LOC) hook qui s'abonne à `navigator.serviceWorker.addEventListener('message', ...)`, filtre type `eac-push`, déclenche un toast (`useToast`) et invalide React Query `['notifications']` + `['coach-comments-recent-48h']`. Garde-fous SSR + no-SW. Monté dans App.tsx via wrapper PushBridge component (pattern DarkModeApplier/CacheWarmer). 5/5 tests passants.)

Précédente : §179 (Coach hardening résiduel — `StrengthCatalog.tsx` createSession mutation reçoit `onError: () => setAssignAfterSaveId(null)` pour éviter qu'un échec de création laisse l'state armé vers un targetId stale. `assignments.ts` rollback notif orpheline (DELETE notification après échec target insert §173) wrappé dans try/catch dédié — préserve la traçabilité du targetError.message original si le DELETE échoue lui-même. Test "rollback delete failure does not mask targetError" ajouté. Migration 00147 `assigned_by` WITH CHECK reportée — nécessite tests RLS Docker.)

Précédente : §178 (Auth hardening — `auth.ts` loadUser + handleAuthEvent hydratent `lastRefreshAt` depuis `session.expires_at * 1000 - 3600_000` au lieu de `Date.now()` à l'init module → le check elapsed > 50 min sur visibilitychange évalue contre l'âge réel du token, pas le module load time. visibilitychange listener reset `consecutiveRefreshFailures = 0` + update `lastRefreshAt` sur succès — cohérence avec le timer L473, évite signOut prématuré après visibilitychange réussi suivi d'échec timer. +2 tests sur auth-state.test.ts.)

Précédente : §177 (Reconcile timeout agrégé + parallèle — `reconcileStrengthRunLogs` wrappé dans `withTimeout(Promise.allSettled(...), 30_000, "reconcile-batch")` → budget global 30 s sur le batch parallèle au lieu de N×10s séquentiels. `Strength.tsx onFinish` : `catch` typé avec branchement `isTransientError` (transient → enqueue + summary, non-transient → toast destructif rester sur WorkoutRunner). `setIsFinishing(false)` déplacé en `finally` (était `catch` only — bouton restait disabled sur erreur non-transiente). NEW `reconcileTimeout.test.ts` (3 tests via `mock.module`).)

Précédente : §176 (Fix PWA update gate régression — `UpdateNotification` refonte : suppression auto-reload 10 s, ajout bouton "Plus tard" (ghost dismiss), bouton "Recharger" (primary explicite), guard focus-mode via `useStrengthState().activeRunId` + `useRef<boolean>` pendingUpdateDuringFocus pour re-trigger dès fin de WorkoutRunner. `OfflineDetector` décalé `top-3→top-12` pour stagger position. 9 nouveaux tests logique pure.)

Précédente : §173 (Audit robustesse chemin critique COACH — login → builder → assign → comms : 15 défauts P0/P1/P2 corrigés sur 8 commits, branche `chantier/171-coach-critical-path-hardening`. P0 : garde `groupIds=[]` dans `bulkCreateSlotAssignments` (défense en profondeur API + validation client `visibleFrom > scheduledDate` en miroir du CHECK 00088) ; rollback notif orpheline dans `assignments_create` (DELETE notification si `notification_targets` insert échoue) ; rollback observable du `quickComposeMutation` (console.error sur orphan + suffix toast informe le coach qu'une intervention manuelle est requise). P1 : `markRead` idempotent dans `CoachCommentsScreen` via `useRef<Set<sessionId>>` (évite write spam toutes les 2 min via invalidation `coach-comments-recent-48h`) ; double-tap guard synchrone `submittingRef` sur "Créer & assigner" et "Bibliothèque" du `SlotSessionSheet` (évite double mutation iOS fast-tap) ; sticky CTA QuickCompose + helper text `visible_from` ("publier immédiatement" vs "programmer pour plus tard") + confirm bloquant si `split_distance` détecté (perte de mètres) + `key={slot.id+date}` remount complet du sheet à chaque changement d'instance (évite state leak `selectedGroups`) ; garde dossier supprimé dans `SwimCatalog.handleMoveToFolder` (`allFolders.includes(folder)`) ; bouton "Enreg. & assigner" dans `StrengthSessionBuilder` via `FormActions.onSaveAndAssign` + dialog inline `<AssignAthleteSelect>` + chaînage `createSession.onSuccess → assignments_create` (5+ taps → 3 pour créer une séance muscu et l'assigner à un nageur). P2 : `Dialog` Radix au lieu de `window.prompt` pour création dossier muscu (focus auto, validation Enter) ; reset `warmup_reps`/`warmup_duration` quand l'exercice repasse en `strength` (évite champs orphelins persistés) ; refactor `DragDropList → OrderedList` (le composant n'avait pas de DnD réel, 0 callsite externe). Plan TDD dans `docs/plans/2026-04-26-coach-critical-path-hardening-plan.md`. Tests : 333 → 336 (+2 gardes assignments + 1 Save & Assign), 0 régression. 4 tests RLS additionnels (Task 13 du plan : `chk_visible_from_before_date`, isolation cross-coach, `idx_sa_unique_slot_group_v2`) reportés au prochain run avec Docker démarré).

Pour ajouter un nouveau chantier, suivre le workflow § "Workflow de documentation obligatoire" ci-dessous.

## Workflow de documentation obligatoire

Chaque session de développement doit suivre ce protocole (détail complet dans `docs/ROADMAP.md` § "Règles de documentation") :

1. **Avant** : Lire `CLAUDE.md` → `docs/ROADMAP.md` (chantier ciblé) → `docs/FEATURES_STATUS.md`
2. **Pendant** : Ajouter une entrée dans `docs/implementation-log.md` pour chaque patch (contexte, changements, fichiers modifiés, tests, décisions, limites)
3. **Après** : Mettre à jour les 4 fichiers de suivi :
   - `docs/ROADMAP.md` — statut du chantier (A faire → En cours → Fait) **+ ligne `*Dernière mise à jour*` en tête du fichier**
   - `docs/FEATURES_STATUS.md` — statut des features impactées (❌ → ⚠️ → ✅)
   - `docs/implementation-log.md` — entrée déjà ajoutée au §2
   - `CLAUDE.md` — voir règles ci-dessous

### Règles de mise à jour de CLAUDE.md (obligatoires)

L'annuaire `docs/claude/files-map.md` et la section "Chantiers" dérivent rapidement si on ne les met pas à jour à chaque patch. À la fin de chaque § :

1. **Annuaire de fichiers** — pour CHAQUE fichier touché par le patch :
   - **Nouveau fichier** créé ≥ 150 lignes OU jouant un rôle architectural → **ajouter une ligne** dans `docs/claude/files-map.md`, avec : chemin exact, rôle en 1 phrase, taille mesurée via `wc -l`.
   - **Fichier existant** dont la taille a varié de **> 30 %** → **mettre à jour la taille** dans `docs/claude/files-map.md`.
   - **Fichier supprimé/renommé** → **mettre à jour** `docs/claude/files-map.md`.
   - **Hubs/orchestrateurs critiques** (nouveau module API majeur, nouvelle page principale) → aussi mettre à jour le petit tableau de `CLAUDE.md` § "Hubs & orchestrateurs critiques".
   - **Ne jamais inventer de taille.** Si pas mesurée, ne pas écrire de chiffre.

2. **Pour chaque § ajouté à `implementation-log.md`** : ajouter une ligne dans `docs/ROADMAP.md` (plus dans CLAUDE.md). Mettre à jour la phrase "Dernière entrée en date : §N" dans CLAUDE.md § "Chantiers".

3. **Edge Functions** — si une Edge Function est ajoutée/supprimée/renommée dans `supabase/functions/`, mettre à jour la table "Edge Functions Supabase".

> **Règle d'or : aucun patch sans entrée dans `implementation-log.md` ET sans mise à jour correspondante de CLAUDE.md (fichiers clés + chantier).**

## Migrations Supabase

**IMPORTANT : Toujours appliquer les migrations via le MCP Supabase (`mcp__plugin_supabase_supabase__apply_migration`), jamais via `supabase db push` ou le dashboard.**

- Le projet ID est `fscnobivsgornxdwqwlk` (EAC Databases, région eu-west-1)
- Les policies RLS utilisent les helpers `app_user_role()` et `app_user_id()` — ne PAS utiliser `auth.uid()` directement dans les subqueries
- Toujours créer le fichier SQL dans `supabase/migrations/` ET l'appliquer via MCP dans la même session
- Convention de nommage : `00XXX_<nom_descriptif>.sql` (incrémenter le numéro)

## Déploiement

**IMPORTANT : Ne JAMAIS déployer localement avec `npx gh-pages -d dist`.**

Le déploiement se fait exclusivement via **GitHub Actions** (`.github/workflows/pages.yml`). Les credentials Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) sont stockées dans les **GitHub Secrets** et injectées au build par le workflow CI/CD. Un build local n'a pas ces variables → l'app affiche "Supabase not configured".

**Comment déployer :**
1. Pousser sur `main` → le workflow se lance automatiquement
2. Ou déclencher manuellement : `gh workflow run "Deploy to GitHub Pages"`

**Ne PAS faire :**
- `npx gh-pages -d dist` (écrase le déploiement avec un build sans credentials)
- `npm run build && deploy` localement (même problème)

## Cache bust

L'application est servie sur GitHub Pages avec les meta tags `apple-mobile-web-app-capable`. Les navigateurs (surtout Safari iOS) cachent agressivement `index.html`.

**Mécanisme en place :**
- `index.html` contient les meta tags `Cache-Control: no-cache, no-store, must-revalidate`
- `vite.config.ts` injecte `__BUILD_TIMESTAMP__` automatiquement à chaque build (visible dans la console navigateur)
- Les assets JS/CSS ont des content hashes automatiques (Vite default)

**Règle obligatoire** : À chaque patch/déploiement, vérifier que :
1. Le build timestamp est bien injecté (vérifier dans la console : `[EAC] Build: <date>`)
2. Si un changement ne se reflète pas après déploiement, demander aux utilisateurs de vider le cache ou faire un hard refresh (Ctrl+Shift+R)
3. Ne jamais ajouter de service worker sans mécanisme de mise à jour automatique (risque de cache permanent)

## Points d'attention

- `api.ts` a été refactoré de ~2277 à ~426 lignes — 7 modules extraits dans `src/lib/api/` (strength, records, users, assignments, notifications, timesheet, swim)
- Le routing est hash-based (`useHashLocation` de Wouter) — les URLs sont `/#/path`
- L'inscription utilise `supabase.auth.signUp()` avec metadata (name, birthdate, group_id)
- Un trigger PostgreSQL (`handle_new_auth_user`) crée automatiquement les entrées `users`, `user_profiles`, `group_members` à l'inscription
- Les migrations sont dans `supabase/migrations/`
- Le fallback localStorage est activé quand Supabase n'est pas disponible

## Agents & coût — règles anti-hallucination

Un agent spawné coûte **~20x plus** qu'un Grep/Glob direct (contexte dupliqué + appels internes cumulés). Règles :

- **Grep/Glob/Read directs** pour toute recherche simple (fichier, symbole, signature). Agents = recherches multi-étapes uniquement.
- **Prompts d'agents** : donner des **chemins précis**, demander **fichier + ligne** en retour, **scope étroit**.
- **Vérifier avant d'agir** : avant d'éditer ou de rapporter un fait précis à l'utilisateur, confirmer avec un Read/Grep que le fichier/symbole existe réellement. Ne pas re-vérifier ce qui est déjà connu (tableau "Fichiers clés", info non actionnable).
- **Résultats contradictoires** entre agents → trancher dans le code source directement.

## Commandes

```bash
npm install          # Installation
npm run dev          # Dev server (localhost:8080)
npm run build        # Build production
npm test             # Tests Vitest
npm run test:rls     # Tests RLS intégration (nécessite Docker + supabase start — voir docs/rls-testing.md)
npx tsc --noEmit     # Type check
```

## Tests RLS intégration (§121)

Tests contre un Postgres local pour attraper les régressions de policies silencieuses (type §113 : DELETE no-op pris pour un succès). Harness complet dans `supabase/tests/rls/` avec schéma hand-crafted minimal (pas de replay des 108 migrations prod — schema drift trop important).

**Setup** (une fois) : Docker Desktop + `brew install supabase/tap/supabase libpq`, puis `supabase start`.

**Documentation complète** : `docs/rls-testing.md` (setup, API du harness, ajout d'un test, pièges fréquents, relation avec migrations prod).

### Règles d'usage pour Claude (obligatoire)

**Quand lancer `npm run test:rls` :** uniquement si le patch touche à **au moins un** des éléments suivants :

1. **Migration SQL** qui modifie une policy RLS (`CREATE/ALTER/DROP POLICY`) ou une table sous RLS (`ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY`).
2. **Helpers auth** : `app_user_id()`, `app_user_role()`, `auth.uid()` ou équivalents (toute fonction SQL qui alimente les clauses `USING`/`WITH CHECK`).
3. **Wrapper API JS** dans `src/lib/api/*.ts` qui ajoute/modifie un appel Supabase pour une table sous RLS, **si la nouvelle logique peut dépendre du rôle appelant** (ex: nouveau CRUD coach/athlète, nouveau `.select()` qui suppose filtrage serveur).
4. **Schéma de test** lui-même : modification de `supabase/tests/schema.sql` ou `seed.sql`.
5. **Debug ciblé** : l'utilisateur soupçonne une régression RLS sur une feature existante et demande explicitement de reproduire.

**Quand NE PAS lancer :**

- Modifications purement UI/UX (composants React, Tailwind, CSS, routing, typage).
- Ajout/modif de helpers purs (`src/lib/*.ts` non-API).
- Fix de bug JS sans relation avec les permissions (mémoïsation, effet, state).
- Refactor interne d'un module API qui **ne change pas** la logique d'autorisation.
- Tests `npm test`, `npm run test:e2e`, type check — qui tournent vite et n'ont pas besoin de Docker.

**Docker n'est pas démarré par Claude automatiquement.** Avant de lancer `supabase start` ou `npm run test:rls`, Claude doit :

1. Vérifier si Docker tourne : `docker ps` (silencieux si OK, erreur sinon).
2. **Si Docker n'est pas lancé**, **demander à l'utilisateur** de lancer Docker Desktop manuellement et **attendre confirmation** avant de continuer. Ne pas tenter `open -a Docker` sans permission explicite — le user contrôle ses ressources système.
3. Si Docker tourne mais `supabase start` n'a pas été exécuté, lancer `supabase start` directement (zéro risque, juste du démarrage de containers).

**Si un test échoue :** ne pas commit, diagnostiquer via `docs/rls-testing.md § Débugger`.

### Économie de tokens (obligatoire)

Coûts mesurés — chaque token gaspillé est un token en moins pour le raisonnement :

| Action | Tokens (~) | Règle |
|---|---|---|
| `docker ps` | 690 | **1× par session max.** Si déjà vérifié et OK, ne pas re-vérifier. Retenir le résultat. |
| `npm run test:rls` output | 300 | OK si critères ci-dessus remplis. **Jamais "pour vérifier" sur un patch UI.** |
| `supabase start` | 750 | **1× par session.** Si containers déjà up (docker ps OK), ne pas relancer. |
| Lire 1 fichier test (~170 LOC) | 1 700 | **Uniquement si on le modifie.** Ne pas lire "pour comprendre" si on ne touche pas aux tests. |
| Lire TOUS les fichiers test | 23 000 | **INTERDIT** sauf demande explicite de l'utilisateur ou audit global. Lire uniquement le fichier ciblé. |
| Lire `docs/rls-testing.md` | 2 600 | **Uniquement pour debug** d'un test qui échoue ou ajout d'un nouveau test. Pas pour un simple run. |
| Lire `supabase/tests/schema.sql` | 4 800 | **Uniquement si on ajoute une table/policy au schéma de test.** Pas pour un simple run. |

**Règle générale** : le workflow normal (patch RLS → run tests → commit) coûte **~990 tokens** (docker ps + test output). Toute lecture de fichier test supplémentaire doit être justifiée par un besoin concret (modification, debug, ajout).

### Gestion stricte du Contexte et des Sessions (NOUVEAU)

L'utilisation de Claude Code consomme très vite le quota quotidien parce que le contexte de la session grossit à chaque question. **Il est vital de suivre cette hygiène** :

1. **Cycle de vie court des sessions et Auto-nettoyage (IMPORTANT)**
   - L'accumulation d'historique coûte extrêmement cher en tokens. 
   - **Règle absolue pour toi (Claude)** : Dès que tu as validé un plan d'implémentation complet ou passé un jalon majeur sur une tâche, tu DOIS vider ou compacter ton contexte de manière totalement autonome sans demander d'intervention à l'utilisateur. 
   - Utilise l'outil ou la commande appropriée à ta disposition (par ex. commande interne de compactage ou exécution autonome d'un vidage avec résumé).
   - Assure-toi de garder en mémoire courte l'objectif principal et la référence au fichier de suivi (ex: `docs/ROADMAP.md`) lors du vidage pour ne pas perdre le fil. Ne notifie l'utilisateur que pour confirmer la complétion de la tâche et ton avancement, sans lui demander de taper de commandes de maintenance.

2. **Choix du Modèle (Scaling) pour Claude Code**
   - `claude --model claude-3-haiku-20240307` (ou alias `haiku`) : À utiliser en priorité pour des petits refactorings, des alignements visuels Tailwind, de l'édition d'un seul fichier, ou la rédaction d'un log. C'est presque gratuit.
   - `claude` (par défaut Sonnet/Opus) : À réserver UNIQUEMENT pour les tâches où l'agent doit arpenter de nombreux fichiers, pour le design architectural global, ou la résolution d'un bug incompréhensible nécessitant une grande compréhension systémique.

3. **Environnement purifié via `.claudeignore`**
   Un fichier `.claudeignore` est désormais en place (ignorant `dist`, `node_modules`, `public`, `.git`, etc.) pour empêcher le glob/grep de siphonner des fichiers minifiés ou massifs non pertinents. Ne pas le supprimer. S'il y a un dossier lourd temporaire, ajoutez-le.

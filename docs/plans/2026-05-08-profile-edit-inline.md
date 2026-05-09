# Profile Edit Inline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer les deux Sheets (modifier profil / mot de passe) par des sections inline plein écran dans `Profile.tsx`, éliminant le scroll horizontal mobile et harmonisant l'UI avec le reste de la page.

**Architecture:** Ajouter `"edit"` et `"password"` au type `ProfileSection` existant. Supprimer les états `isEditSheetOpen`/`isPasswordSheetOpen` et les deux `<Sheet>`. Rendre les vues edit/password via le guard pattern `if (activeSection === "edit") return (...)` déjà utilisé pour Messages et Neurotype.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Shadcn/Radix (Card, Button, Input, Select, Textarea, Avatar), React Hook Form, Zod, Framer Motion, Lucide React.

---

### Task 1 : Mise à jour des imports et du type ProfileSection

**Files:**
- Modify: `src/pages/Profile.tsx:26` (imports lucide)
- Modify: `src/pages/Profile.tsx:44-48` (type ProfileSection)

**Step 1 : Ajouter `ChevronLeft` dans l'import lucide-react**

Ligne 26, remplacer :
```ts
import { Lock, Pen, Trophy, LogOut, Save, AlertCircle, Download, Camera, Trash2, Bell, BellOff, ChevronRight, Settings, Users, Sun, Moon, Monitor, type LucideIcon } from "lucide-react";
```
par :
```ts
import { Lock, Pen, Trophy, LogOut, Save, AlertCircle, Download, Camera, Trash2, Bell, BellOff, ChevronLeft, ChevronRight, Settings, Users, Sun, Moon, Monitor, type LucideIcon } from "lucide-react";
```

**Step 2 : Retirer l'import Sheet (ligne 22)**

Retirer `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription` de l'import `@/components/ui/sheet`. Si c'est le seul usage, supprimer toute la ligne d'import.

**Step 3 : Étendre le type ProfileSection (ligne 44)**

Remplacer :
```ts
type ProfileSection =
  | "home"
  | "messages"
  | "neurotype-quiz"
  | "neurotype-result";
```
par :
```ts
type ProfileSection =
  | "home"
  | "messages"
  | "neurotype-quiz"
  | "neurotype-result"
  | "edit"
  | "password";
```

**Step 4 : Vérifier le type check**

```bash
cd /Users/francoiswagner/Antigravity/Project-EAC/competition && npx tsc --noEmit 2>&1 | head -30
```
Attendu : erreurs liées aux états supprimés pas encore faits — c'est normal à cette étape.

---

### Task 2 : Supprimer les états Sheet et mettre à jour les handlers

**Files:**
- Modify: `src/pages/Profile.tsx:235-237` (états)
- Modify: `src/pages/Profile.tsx:256-267` (reset handler)
- Modify: `src/pages/Profile.tsx:404-431` (mutation onSuccess)
- Modify: `src/pages/Profile.tsx:531-540` (startEdit)

**Step 1 : Supprimer les deux états booléens (lignes 235-237)**

Retirer ces deux lignes :
```ts
const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
const [isPasswordSheetOpen, setIsPasswordSheetOpen] = useState(false);
```

**Step 2 : Mettre à jour le reset handler (lignes 256-267)**

Dans le `useEffect` qui écoute `nav:reset`, retirer :
```ts
setIsEditSheetOpen(false);
setIsPasswordSheetOpen(false);
```
Le bloc reset ne doit garder que :
```ts
const reset = () => {
  setActiveSection("home");
  setCropDialogSrc(null);
  setPendingNeurotypResult(null);
};
```

**Step 3 : Mettre à jour l'onSuccess de `updateProfile` (ligne ~419)**

Remplacer `setIsEditSheetOpen(false)` par `setActiveSection("home")` :
```ts
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["profile"] });
  setActiveSection("home");
  toast({ title: "Profil mis à jour" });
},
```

**Step 4 : Mettre à jour `startEdit` (ligne ~531)**

Remplacer `setIsEditSheetOpen(true)` par `setActiveSection("edit")` :
```ts
const startEdit = () => {
  profileForm.reset({
    group_id: profile?.group_id ? String(profile.group_id) : "",
    bio: profile?.bio || "",
    birthdate: profile?.birthdate ? String(profile.birthdate).split("T")[0] : "",
    ffn_iuf: profile?.ffn_iuf ? String(profile.ffn_iuf) : "",
    phone: profile?.phone || "",
  });
  setActiveSection("edit");
};
```

**Step 5 : Mettre à jour le bouton "Sécurité" dans le JSX (ligne ~693)**

Remplacer `onClick={() => setIsPasswordSheetOpen(true)}` par `onClick={() => setActiveSection("password")}`.

**Step 6 : Vérifier le type check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Attendu : erreurs sur les Sheets encore présents dans le JSX — normal.

---

### Task 3 : Ajouter la section inline "edit"

**Files:**
- Modify: `src/pages/Profile.tsx` — ajouter le guard avant le `return` principal (après le guard `activeSection === "messages"`, ligne ~617)

**Step 1 : Insérer le guard `activeSection === "edit"`**

Juste avant `return (` (le return principal, ligne ~628), insérer :

```tsx
if (activeSection === "edit") {
  return (
    <motion.div
      className="space-y-4 overflow-x-hidden"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setActiveSection("home")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/70 hover:bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight">Modifier le profil</h1>
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-4">
        {/* Photo de profil */}
        <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4 space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">Photo de profil</p>
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-20 w-20 ring-2 ring-primary/20">
              <AvatarImage src={avatarSrc} alt="Avatar" />
              <AvatarFallback>{(user || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={uploadAvatarMutation.isPending}
              onClick={() => document.getElementById("avatar-upload-inline")?.click()}
            >
              <Camera className="h-4 w-4" />
              {uploadAvatarMutation.isPending ? "Envoi..." : "Changer la photo"}
            </Button>
            {profile?.avatar_url && (
              <Button
                type="button"
                variant="ghost"
                className="w-full gap-2 text-destructive hover:text-destructive"
                disabled={deleteAvatarMutation.isPending}
                onClick={() => deleteAvatarMutation.mutate()}
              >
                <Trash2 className="h-4 w-4" />
                {deleteAvatarMutation.isPending ? "Suppression..." : "Supprimer la photo"}
              </Button>
            )}
          </div>
          <input
            id="avatar-upload-inline"
            type="file"
            accept="image/jpeg,image/png,image/webp,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = "";
            }}
          />
        </div>

        {/* Informations */}
        <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4 space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">Informations</p>

          <div className="space-y-1.5">
            <Label>Groupe</Label>
            <Select
              value={profileForm.watch("group_id")}
              onValueChange={(value) => profileForm.setValue("group_id", value)}
              disabled={groupsLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={groupsLoading ? "Chargement..." : "Choisir un groupe"} />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={String(group.id)}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea
              {...profileForm.register("bio")}
              maxLength={500}
              className="resize-none w-full"
              rows={3}
            />
            {profileForm.formState.errors.bio && (
              <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                {profileForm.formState.errors.bio.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Date de naissance</Label>
            <div className="w-full">
              <Input type="date" className="w-full" {...profileForm.register("birthdate")} />
            </div>
            {profileForm.formState.errors.birthdate && (
              <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                {profileForm.formState.errors.birthdate.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-phone-inline">Téléphone</Label>
            <Input
              id="edit-phone-inline"
              type="tel"
              placeholder="06 12 34 56 78"
              maxLength={20}
              className="w-full"
              {...profileForm.register("phone")}
            />
          </div>
        </div>

        {/* IUF FFN — athletes uniquement */}
        {showRecords ? (
          <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4 space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">Identifiant FFN</p>
            <div className="space-y-1.5">
              <Label>IUF FFN</Label>
              <Input
                {...profileForm.register("ffn_iuf")}
                placeholder="879576"
                inputMode="numeric"
                className="w-full"
              />
              {profileForm.formState.errors.ffn_iuf && (
                <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                  {profileForm.formState.errors.ffn_iuf.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Identifiant unique FFN (utilisé pour importer vos records compétition).
              </p>
            </div>
          </div>
        ) : null}

        <Button type="submit" disabled={updateProfile.isPending} className="w-full">
          <Save className="mr-2 h-4 w-4" />
          {updateProfile.isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </motion.div>
  );
}
```

**Step 2 : Vérifier le type check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Attendu : toujours des erreurs sur les Sheets dans le JSX.

---

### Task 4 : Ajouter la section inline "password"

**Files:**
- Modify: `src/pages/Profile.tsx` — insérer après le guard `"edit"`, avant le return principal

**Step 1 : Insérer le guard `activeSection === "password"`**

Juste après le bloc `if (activeSection === "edit") { ... }` (Task 3), insérer :

```tsx
if (activeSection === "password") {
  return (
    <motion.div
      className="space-y-4 overflow-x-hidden"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setActiveSection("home")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/70 hover:bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight">Sécurité</h1>
      </div>

      <form onSubmit={handleUpdatePassword} className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4 space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">Mot de passe</p>
          <p className="text-xs text-muted-foreground">
            Au moins 8 caractères, une majuscule et un chiffre.
          </p>

          <div className="space-y-1.5">
            <Label>Nouveau mot de passe</Label>
            <Input
              type="password"
              className="w-full"
              {...passwordForm.register("password")}
              placeholder="••••••••"
            />
            {passwordForm.formState.errors.password && (
              <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                {passwordForm.formState.errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Confirmer</Label>
            <Input
              type="password"
              className="w-full"
              {...passwordForm.register("confirmPassword")}
              placeholder="••••••••"
            />
            {passwordForm.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                {passwordForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={updatePassword.isPending}>
          {updatePassword.isPending ? "Mise à jour..." : "Mettre à jour le mot de passe"}
        </Button>
      </form>
    </motion.div>
  );
}
```

---

### Task 5 : Supprimer les deux blocs Sheet du JSX principal

**Files:**
- Modify: `src/pages/Profile.tsx:748-910` (Sheets + AvatarCropDialog)

**Step 1 : Supprimer le Sheet "Modifier le profil" (lignes ~748-881)**

Supprimer entièrement ce bloc :
```tsx
{/* Edit profile bottom sheet */}
<Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
  ...
</Sheet>
```

**Step 2 : Supprimer le Sheet "Changer le mot de passe" (lignes ~884-910)**

Supprimer entièrement :
```tsx
<Sheet open={isPasswordSheetOpen} onOpenChange={setIsPasswordSheetOpen}>
  ...
</Sheet>
```

**Step 3 : Conserver le bloc AvatarCropDialog**

Le `{cropDialogSrc && <AvatarCropDialog ... />}` doit rester dans le return principal — il est utilisé depuis la section "edit" via `setCropDialogSrc`.

**Step 4 : Vérifier le type check — doit être propre**

```bash
npx tsc --noEmit 2>&1 | head -40
```
Attendu : 0 erreurs nouvelles (les erreurs pre-existantes dans `*.stories.tsx` sont connues).

---

### Task 6 : Vérification finale et commit

**Step 1 : Lancer le dev server**

```bash
npm run dev
```

**Step 2 : Vérifier visuellement (golden path)**

- Ouvrir `/#/profile`
- Cliquer "Mon profil" → vue edit plein écran s'affiche, pas de scroll horizontal
- Remplir un champ, sauvegarder → retour à home, toast "Profil mis à jour"
- Cliquer "Sécurité" → vue password plein écran
- Cliquer le bouton retour (ChevronLeft) → retour à home
- Vérifier que le bouton "Changer la photo" ouvre bien le file picker
- Vérifier le thème sombre/clair (ThemeSelector doit toujours fonctionner sur home)

**Step 3 : Mettre à jour `docs/implementation-log.md`**

Ajouter une entrée §228 :
- Contexte : scroll horizontal Sheet mobile, UI incohérente
- Changements : ProfileSection étendu, 2 états supprimés, 2 Sheets supprimés, 2 guards inline ajoutés
- Fichiers modifiés : `src/pages/Profile.tsx`
- Décisions : Option B inline (pas de nouvelle route), `overflow-x-hidden` sur containers

**Step 4 : Mettre à jour CLAUDE.md**

Ligne "Dernier § livré" → `§228 — Profile edit/password : Sheets → sections inline plein écran, fix scroll horizontal mobile`

**Step 5 : Commit**

```bash
git add src/pages/Profile.tsx docs/implementation-log.md CLAUDE.md docs/plans/2026-05-08-profile-edit-inline-design.md docs/plans/2026-05-08-profile-edit-inline.md
git commit -m "feat(§228): profile edit/password inline sections — fix mobile horizontal scroll"
```

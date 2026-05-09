import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  getProfile,
  getGroups,
  updateProfile as updateProfileApi,
  authPasswordUpdate,
  uploadAvatar,
  deleteAvatar,
} from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Lock, Pen, Trophy, LogOut, Save, AlertCircle, Download, Camera, Trash2, Bell, BellOff, ChevronLeft, ChevronRight, Settings, Users, Sun, Moon, Monitor, type LucideIcon } from "lucide-react";
import { isPushSupported, hasActivePushSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { compressImage, isAcceptedImageType } from "@/lib/imageUtils";
import AvatarCropDialog from "@/components/profile/AvatarCropDialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { fadeIn } from "@/lib/animations";
import BadgesGrid from "@/components/profile/BadgesGrid";
import { useAchievementChecker } from "@/hooks/useAchievementChecker";
import AchievementToast from "@/components/shared/AchievementToast";
import type { BadgeDefinition } from "@/lib/achievementRules";
import SwimmerMessagesView from "@/components/profile/SwimmerMessagesView";

type ProfileSection =
  | "home"
  | "messages"
  | "edit"
  | "password";

function readProfileSectionFromHash(): ProfileSection {
  if (typeof window === "undefined") return "home";
  const hash = window.location.hash;
  const match = hash.match(/[?&]section=([^&]+)/);
  const requested = match?.[1];

  // Redirect old sections to /suivi
  if (requested === "performance-hub" || requested === "objectives" || requested === "interviews") {
    const routeMap: Record<string, string> = {
      "performance-hub": "/suivi/objectifs",
      objectives: "/suivi/objectifs",
      interviews: "/suivi/entretiens",
    };
    window.location.hash = `#${routeMap[requested]}`;
    return "home";
  }

  switch (requested) {
    case "messages":
      return requested;
    default:
      return "home";
  }
}

export const shouldShowRecords = (role: string | null) => role !== "coach" && role !== "admin" && role !== "comite";

export const getRoleLabel = (role: string | null) => {
  switch (role) {
    case "coach":
      return "Entraineur EAC";
    case "admin":
      return "Admin";
    case "comite":
      return "Comité";
    default:
      return "Nageur";
  }
};


const THEME_OPTIONS = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
] as const;

function ThemeSelector() {
  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem("eac-theme") ?? "light"
  );

  const handleChange = (value: string) => {
    if (!value) return; // ToggleGroup returns "" on deselect
    setTheme(value);
    localStorage.setItem("eac-theme", value);
    window.dispatchEvent(new Event("eac-theme-change"));
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Apparence</span>
        <ToggleGroup
          type="single"
          value={theme}
          onValueChange={handleChange}
          className="rounded-xl bg-muted p-0.5"
        >
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <ToggleGroupItem
                key={opt.value}
                value={opt.value}
                aria-label={opt.label}
                className="rounded-lg px-3 h-9 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                <Icon className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5 text-xs">{opt.label}</span>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>
    </div>
  );
}

function ProfileActionRow({
  icon: Icon,
  title,
  description,
  onClick,
  accentClassName = "text-primary",
  badgeLabel,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  onClick: () => void;
  accentClassName?: string;
  badgeLabel?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-left transition hover:border-primary/25 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
        <Icon className={`h-5 w-5 ${accentClassName}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {badgeLabel ? (
        <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-[0.08em]">
          {badgeLabel}
        </Badge>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

// Profile edit validation schema
const profileEditSchema = z.object({
  group_id: z.string().optional(),
  bio: z.string().optional(),
  birthdate: z.string().optional().refine(
    (val) => {
      if (!val) return true;
      const date = new Date(val);
      if (isNaN(date.getTime())) return false;
      const age = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      return age >= 6 && age <= 100;
    },
    { message: "L'âge doit être entre 6 et 100 ans" }
  ),
  ffn_iuf: z.string().optional().refine(
    (val) => {
      if (!val) return true;
      return /^\d+$/.test(val);
    },
    { message: "L'IUF FFN doit être un nombre" }
  ),
  phone: z.string().optional(),
});

type ProfileEditForm = z.infer<typeof profileEditSchema>;

// Password change validation schema
const passwordChangeSchema = z.object({
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
    .regex(/\d/, "Le mot de passe doit contenir au moins un chiffre"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

type PasswordChangeForm = z.infer<typeof passwordChangeSchema>;

export default function Profile() {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const logout = useAuth((s) => s.logout);
  const role = useAuth((s) => s.role);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const showRecords = shouldShowRecords(role);
  const canUpdatePassword = role === "athlete" || role === "coach" || role === "admin";
  const roleLabel = getRoleLabel(role);

  const [activeSection, setActiveSection] = useState<ProfileSection>(() => readProfileSectionFromHash());
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [cropDialogSrc, setCropDialogSrc] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Badge achievement checker — evaluates rules and unlocks new badges
  const isSwimmer = role === "athlete";
  useAchievementChecker({
    userId: isSwimmer && userId ? userId : 0,
    onBadgeUnlocked: (badge: BadgeDefinition) => {
      toast({
        title: "Badge débloqué !",
        description: <AchievementToast badge={badge} />,
        duration: 5000,
      });
    },
  });

  // Reset view state when dock icon is tapped while already on this page
  useEffect(() => {
    const reset = () => {
      setActiveSection("home");
      setCropDialogSrc(null);
    };
    window.addEventListener("nav:reset", reset);
    return () => window.removeEventListener("nav:reset", reset);
  }, []);

  useEffect(() => {
    const syncSection = () => {
      setActiveSection(readProfileSectionFromHash());
    };
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextHash =
      activeSection === "home" ? "#/profile" : `#/profile?section=${activeSection}`;
    if (window.location.hash === nextHash) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeSection]);

  useEffect(() => {
    if (isPushSupported()) {
      hasActivePushSubscription().then(setPushEnabled);
    }
  }, []);


  const handleTogglePush = async () => {
    if (!userId) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        const ok = await unsubscribeFromPush(userId);
        if (!ok) {
          toast({
            title: "Désactivation impossible",
            description: "Le service worker push n'est pas disponible sur cet appareil.",
            variant: "destructive",
          });
          return;
        }
        setPushEnabled(false);
      } else {
        const ok = await subscribeToPush(userId);
        if (!ok) {
          toast({
            title: "Activation impossible",
            description: "Vérifiez que l'app est installée, que les notifications sont autorisées et que la configuration push est disponible.",
            variant: "destructive",
          });
          return;
        }
        setPushEnabled(true);
      }
    } catch (error) {
      toast({
        title: "Notifications push indisponibles",
        description: error instanceof Error ? error.message : "Une erreur est survenue pendant l'activation.",
        variant: "destructive",
      });
    } finally {
      setPushLoading(false);
    }
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    localStorage.removeItem("app_build_timestamp");
    try {
      // 1. Ask SW to check for a new version (timeout 3s to avoid hanging on slow networks)
      const reg = (window as any).__pwaRegistration as ServiceWorkerRegistration | undefined
        ?? await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await Promise.race([
          reg.update(),
          new Promise((r) => setTimeout(r, 3000)),
        ]);
      }
      // 2. Clear all Workbox caches so reload fetches fresh assets
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch { /* best-effort — always reload below */ }
    // 3. Always hard reload, even if SW check or cache clear failed
    window.location.reload();
  };

  // Profile edit form with React Hook Form + Zod
  const profileForm = useForm<ProfileEditForm>({
    resolver: zodResolver(profileEditSchema),
    defaultValues: {
      group_id: "",
      bio: "",
      birthdate: "",
      ffn_iuf: "",
      phone: "",
    },
  });

  // Password change form with React Hook Form + Zod
  const passwordForm = useForm<PasswordChangeForm>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const { data: profile, isLoading: profileLoading, error: profileError, refetch: refetchProfile } = useQuery({
    queryKey: ["profile", user, userId],
    queryFn: () => getProfile({ displayName: user, userId }),
    enabled: !!user,
  });

  const { data: groups = [], isLoading: groupsLoading, error: groupsError, refetch: refetchGroups } = useQuery({
    queryKey: ["profile-groups"],
    queryFn: () => getGroups(),
    enabled: !!user,
  });

  const error = profileError || groupsError;
  const refetch = () => {
    refetchProfile();
    refetchGroups();
  };



  const avatarSrc = useMemo(() => {
    const src = profile?.avatar_url;
    if (src) return src;
    if (user) return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user)}`;
    return "";
  }, [profile, user]);



  const updateProfile = useMutation({
    mutationFn: (data: ProfileEditForm) =>
      updateProfileApi({
        userId,
        profile: {
          group_id: data.group_id ? Number(data.group_id) : null,
          group_label: data.group_id
            ? groups.find((g) => g.id === Number(data.group_id))?.name ?? null
            : null,
          birthdate: data.birthdate || null,
          bio: data.bio,
          ffn_iuf: (data.ffn_iuf || "").trim() || null,
          phone: data.phone || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setActiveSection("home");
      toast({ title: "Profil mis à jour" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Mise à jour impossible",
        description: String((error as Error)?.message || error),
        variant: "destructive",
      });
    },
  });

  const updatePassword = useMutation({
    mutationFn: (payload: { password: string }) => authPasswordUpdate(payload),
    onSuccess: () => {
      passwordForm.reset();
      toast({ title: "Mot de passe mis à jour" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Mise à jour impossible",
        description: String((error as Error)?.message || error),
        variant: "destructive",
      });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (croppedBlob: Blob) => {
      if (!userId) throw new Error("Utilisateur non identifié");
      const file = new File([croppedBlob], "avatar.png", { type: "image/png" });
      const { blob, mimeType, extension } = await compressImage(file);
      return uploadAvatar({ userId, blob, mimeType, extension });
    },
    onSuccess: () => {
      setCropDialogSrc(null);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      toast({ title: "Photo de profil mise à jour" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Impossible de charger la photo",
        description: String((error as Error)?.message || error),
        variant: "destructive",
      });
    },
  });

  const handleFileSelected = (file: File) => {
    if (!isAcceptedImageType(file)) {
      toast({
        title: "Format non supporté",
        description: "Utilisez JPEG, PNG ou WebP.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Fichier trop volumineux",
        description: "La taille maximale est de 10 Mo.",
        variant: "destructive",
      });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setCropDialogSrc(objectUrl);
  };

  const deleteAvatarMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Utilisateur non identifié");
      return deleteAvatar(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      toast({ title: "Photo supprimée" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Impossible de supprimer la photo",
        description: String((error as Error)?.message || error),
        variant: "destructive",
      });
    },
  });

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

  const handleSaveProfile = profileForm.handleSubmit((data) => {
    updateProfile.mutate(data);
  });

  const handleUpdatePassword = passwordForm.handleSubmit((data) => {
    updatePassword.mutate({ password: data.password });
  });

  const groupLabel =
    groups.find((g) => g.id === profile?.group_id)?.name ||
    profile?.group_label ||
    "Non défini";

  if (profileLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-accent p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold">Impossible de charger les données</h3>
        <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        <Button onClick={() => refetch()} className="mt-4">
          Réessayer
        </Button>
      </div>
    );
  }

  if (activeSection === "messages") {
    return (
      <SwimmerMessagesView
        userId={userId ?? 0}
        onBack={() => window.history.back()}
        onOpenProfileSection={(section) => setActiveSection(section)}
      />
    );
  }

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

  return (
    <motion.div
      className="space-y-6"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
    >
      {/* Hero compact */}
      <div className="rounded-xl bg-accent text-accent-foreground p-5">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 ring-2 ring-primary ring-offset-2 ring-offset-accent">
            <AvatarImage src={avatarSrc} alt={user || "Profil"} />
            <AvatarFallback className="text-lg">{(user || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-accent-foreground truncate">{user}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">{roleLabel}</Badge>
              <span className="text-sm opacity-80">{groupLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {role === "admin" ? (
          <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base uppercase tracking-[0.08em]">Administration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProfileActionRow
                icon={Settings}
                title="Gestion des comptes"
                description="Utilisateurs, rôles, activation"
                onClick={() => navigate("/admin")}
              />
              <ProfileActionRow
                icon={Users}
                title="Comité"
                description="Validation heures, approbations"
                onClick={() => navigate("/comite")}
              />
              <ProfileActionRow
                icon={Trophy}
                title="Records Admin"
                description="Import FFN, paramètres sync"
                onClick={() => navigate("/records-admin")}
              />
            </CardContent>
          </Card>
        ) : null}

        {userId ? <BadgesGrid userId={userId} /> : null}

        <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base uppercase tracking-[0.08em]">Mon compte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProfileActionRow
              icon={Pen}
              title="Mon profil"
              onClick={startEdit}
            />
            {canUpdatePassword ? (
              <ProfileActionRow
                icon={Lock}
                title="Sécurité"
                onClick={() => setActiveSection("password")}
              />
            ) : null}
            <ProfileActionRow
              icon={Download}
              title="Mettre à jour l'app"
              badgeLabel={isCheckingUpdate ? "en cours" : (() => {
                const ts = (window as any).__eacBuildTimestamp as string | undefined;
                if (!ts) return null;
                try { const d = new Date(ts); return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
                catch { return null; }
              })()}
              onClick={handleCheckUpdate}
            />
            {isPushSupported() ? (
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    {pushEnabled ? (
                      <Bell className="h-5 w-5 text-primary" />
                    ) : (
                      <BellOff className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Notifications push</p>
                    <p className="text-xs text-muted-foreground">
                      {pushEnabled ? "Activées" : "Désactivées"}
                    </p>
                  </div>
                  <Switch
                    checked={pushEnabled}
                    disabled={pushLoading}
                    onCheckedChange={() => handleTogglePush()}
                    aria-label={pushEnabled ? "Désactiver les notifications push" : "Activer les notifications push"}
                  />
                </div>
              </div>
            ) : null}
            <ThemeSelector />
          </CardContent>
        </Card>
      </div>

      {/* Logout */}
      <Button variant="destructive" onClick={logout} className="w-full gap-2">
        <LogOut className="h-4 w-4" />
        Se déconnecter
      </Button>

      {/* Avatar crop dialog */}
      {cropDialogSrc && (
        <AvatarCropDialog
          open={!!cropDialogSrc}
          imageSrc={cropDialogSrc}
          onClose={() => {
            URL.revokeObjectURL(cropDialogSrc);
            setCropDialogSrc(null);
          }}
          onCropDone={(blob) => {
            URL.revokeObjectURL(cropDialogSrc);
            uploadAvatarMutation.mutate(blob);
          }}
        />
      )}
    </motion.div>
  );
}

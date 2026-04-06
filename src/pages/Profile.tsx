import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Lock, Pen, Trophy, LogOut, Save, AlertCircle, Download, Camera, Trash2, Brain, Clock, Bell, BellOff, BellRing, ChevronRight, FileText, type LucideIcon } from "lucide-react";
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
import { NeurotypQuiz } from "@/components/neurotype/NeurotypQuiz";
import NeurotypResultView from "@/components/neurotype/NeurotypResult";
import { NEUROTYPE_PROFILES } from "@/lib/neurotype-quiz-data";
import type { NeurotypResult as NeurotypResultType, NeurotypCode } from "@/lib/api/types";

type ProfileSection =
  | "home"
  | "messages"
  | "neurotype-quiz"
  | "neurotype-result";

function readProfileSectionFromHash(): ProfileSection {
  if (typeof window === "undefined") return "home";
  const hash = window.location.hash;
  const match = hash.match(/[?&]section=([^&]+)/);
  const requested = match?.[1];

  // Redirect old sections to /suivi
  if (requested === "performance-hub" || requested === "objectives" || requested === "interviews") {
    const tabMap: Record<string, string> = {
      "performance-hub": "objectifs",
      objectives: "objectifs",
      interviews: "entretiens",
    };
    window.location.hash = `#/suivi?tab=${tabMap[requested]}`;
    return "home";
  }

  switch (requested) {
    case "messages":
    case "neurotype-quiz":
    case "neurotype-result":
      return requested;
    default:
      return "home";
  }
}

function readDismissedNotificationIds(userId: number | null | undefined): number[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = window.localStorage.getItem(`profile-notifications-dismissed:${userId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];
  } catch {
    return [];
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

const getNeurotypName = (code: string) => NEUROTYPE_PROFILES[code as NeurotypCode]?.name ?? code;

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

function ProfileActionTile({
  icon: Icon,
  title,
  meta,
  onClick,
  accentClassName = "text-primary",
  badgeLabel,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string | null;
  onClick: () => void;
  accentClassName?: string;
  badgeLabel?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-3xl border border-border/70 bg-background/70 p-4 text-left transition hover:border-primary/25 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className={`h-5 w-5 ${accentClassName}`} />
        </div>
        {badgeLabel ? (
          <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-[0.08em]">
            {badgeLabel}
          </Badge>
        ) : null}
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {meta ? <p className="mt-1 text-xs text-muted-foreground">{meta}</p> : null}
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
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isPasswordSheetOpen, setIsPasswordSheetOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [cropDialogSrc, setCropDialogSrc] = useState<string | null>(null);
  const [pendingNeurotypResult, setPendingNeurotypResult] = useState<NeurotypResultType | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [dismissedTargetIds, setDismissedTargetIds] = useState<number[]>([]);

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
      setIsEditSheetOpen(false);
      setIsPasswordSheetOpen(false);
      setCropDialogSrc(null);
      setPendingNeurotypResult(null);
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

  useEffect(() => {
    setDismissedTargetIds(readDismissedNotificationIds(userId));
  }, [userId, activeSection]);

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
      // 1. Force SW to check for a new version
      const reg = (window as any).__pwaRegistration as ServiceWorkerRegistration | undefined
        ?? await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.update();
        // Wait for new SW to install + activate (skipWaiting is enabled)
        await new Promise((r) => setTimeout(r, 1500));
      }
      // 2. Clear all Workbox caches so reload fetches fresh assets
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      // 3. Hard reload
      window.location.reload();
    } catch {
      window.location.reload();
    }
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
    queryFn: () => api.getProfile({ displayName: user, userId }),
    enabled: !!user,
  });

  const { data: groups = [], isLoading: groupsLoading, error: groupsError, refetch: refetchGroups } = useQuery({
    queryKey: ["profile-groups"],
    queryFn: () => api.getGroups(),
    enabled: !!user,
  });

  const error = profileError || groupsError;
  const refetch = () => {
    refetchProfile();
    refetchGroups();
  };

  const isSwimmerProfile = showRecords;

  const { data: profileNotifications } = useQuery({
    queryKey: ["profile-notifications-summary", userId],
    queryFn: () =>
      api.notifications_list({
        targetUserId: userId ?? null,
        limit: 100,
      }),
    enabled: isSwimmerProfile && !!userId,
  });


  const avatarSrc = useMemo(() => {
    const src = profile?.avatar_url;
    if (src) return src;
    if (user) return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user)}`;
    return "";
  }, [profile, user]);

  const visibleNotifications = useMemo(
    () =>
      (profileNotifications?.notifications ?? []).filter(
        (notification) =>
          notification.target_id == null || !dismissedTargetIds.includes(notification.target_id),
      ),
    [dismissedTargetIds, profileNotifications?.notifications],
  );

  const unreadMessageCount = useMemo(
    () => visibleNotifications.filter((notification) => !notification.read).length,
    [visibleNotifications],
  );


  const updateProfile = useMutation({
    mutationFn: (data: ProfileEditForm) =>
      api.updateProfile({
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
      setIsEditSheetOpen(false);
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
    mutationFn: (payload: { password: string }) => api.authPasswordUpdate(payload),
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
      return api.uploadAvatar({ userId, blob, mimeType, extension });
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
      return api.deleteAvatar(userId);
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

  const saveNeurotyp = useMutation({
    mutationFn: (result: NeurotypResultType) =>
      api.updateProfile({
        userId,
        profile: { neurotype_result: result },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setPendingNeurotypResult(null);
      setActiveSection("home");
      toast({ title: "Neurotype enregistré" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
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
    setIsEditSheetOpen(true);
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

  if (activeSection === "neurotype-quiz") {
    return (
      <NeurotypQuiz
        onComplete={(result) => {
          setPendingNeurotypResult(result);
          setActiveSection("neurotype-result");
        }}
        onCancel={() => setActiveSection("home")}
      />
    );
  }

  if (activeSection === "neurotype-result" && pendingNeurotypResult) {
    return (
      <NeurotypResultView
        result={pendingNeurotypResult}
        onSave={(result) => saveNeurotyp.mutate(result)}
        onRetry={() => {
          setPendingNeurotypResult(null);
          setActiveSection("neurotype-quiz");
        }}
        onBack={() => setActiveSection("home")}
        isSaving={saveNeurotyp.isPending}
      />
    );
  }

  if (activeSection === "messages") {
    return (
      <SwimmerMessagesView
        userId={userId ?? 0}
        onBack={() => setActiveSection("home")}
        onOpenProfileSection={(section) => setActiveSection(section)}
      />
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
            <h1 className="text-2xl font-display font-bold uppercase italic text-accent-foreground truncate">{user}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">{roleLabel}</Badge>
              <span className="text-sm opacity-80">{groupLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {isSwimmerProfile && unreadMessageCount > 0 ? (
          <Card className="overflow-hidden border-primary/15 bg-gradient-to-r from-primary/[0.08] via-card to-amber-500/[0.08] shadow-sm">
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Maintenant</p>
                <Badge className="text-[10px]">1</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setActiveSection("messages")}>
                  {unreadMessageCount} message{unreadMessageCount > 1 ? "s" : ""}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showRecords ? (
          <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base uppercase tracking-[0.08em]">Accès rapides</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <ProfileActionTile
                icon={BellRing}
                title="Messages"
                meta={unreadMessageCount > 0 ? `${unreadMessageCount} non lu${unreadMessageCount > 1 ? "s" : ""}` : "Boîte vide"}
                badgeLabel={unreadMessageCount > 0 ? String(unreadMessageCount) : null}
                onClick={() => setActiveSection("messages")}
              />
              <ProfileActionTile
                icon={Clock}
                title="Mon suivi"
                meta="Plan et ressentis"
                onClick={() => navigate("/suivi")}
              />
              <ProfileActionTile
                icon={Trophy}
                title="Records"
                meta="Performances"
                onClick={() => navigate("/records")}
              />
              <ProfileActionTile
                icon={Trophy}
                title="Club"
                meta="Hall of Fame"
                onClick={() => navigate("/hall-of-fame")}
              />
              <ProfileActionTile
                icon={FileText}
                title="Rapport mensuel"
                meta="Bilan du mois"
                onClick={() => {
                  const now = new Date();
                  const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                  navigate(`/report/${userId}/${m}`);
                }}
              />
              <ProfileActionTile
                icon={Brain}
                title="Neurotype"
                meta={profile?.neurotype_result ? getNeurotypName(profile.neurotype_result.dominant) : "Découvrir"}
                onClick={() => {
                  if (profile?.neurotype_result) {
                    setPendingNeurotypResult(profile.neurotype_result);
                    setActiveSection("neurotype-result");
                  } else {
                    setActiveSection("neurotype-quiz");
                  }
                }}
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
                onClick={() => setIsPasswordSheetOpen(true)}
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
                  <Button
                    size="sm"
                    variant={pushEnabled ? "outline" : "default"}
                    onClick={handleTogglePush}
                    disabled={pushLoading}
                  >
                    {pushLoading ? "..." : pushEnabled ? "Off" : "On"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Logout */}
      <Button variant="destructive" onClick={logout} className="w-full gap-2">
        <LogOut className="h-4 w-4" />
        Se déconnecter
      </Button>

      {/* Edit profile bottom sheet */}
      <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Modifier le profil</SheetTitle>
            <SheetDescription>Mettez à jour vos informations personnelles.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSaveProfile} className="space-y-4 mt-4">
            <div className="grid gap-2">
              <Label>Groupe</Label>
              <Select
                value={profileForm.watch("group_id")}
                onValueChange={(value) => profileForm.setValue("group_id", value)}
                disabled={groupsLoading}
              >
                <SelectTrigger>
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

            {showRecords ? (
              <div className="grid gap-2">
                <Label>IUF FFN</Label>
                <Input
                  {...profileForm.register("ffn_iuf")}
                  placeholder="879576"
                  inputMode="numeric"
                />
                {profileForm.formState.errors.ffn_iuf && (
                  <p className="text-xs text-destructive" role="alert" aria-live="assertive">{profileForm.formState.errors.ffn_iuf.message}</p>
                )}
                <div className="text-xs text-muted-foreground">
                  Identifiant unique FFN (utilisé pour importer vos records compétition).
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>Bio</Label>
              <Textarea {...profileForm.register("bio")} />
              {profileForm.formState.errors.bio && (
                <p className="text-xs text-destructive" role="alert" aria-live="assertive">{profileForm.formState.errors.bio.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Photo de profil</Label>
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16 ring-2 ring-primary/20">
                  <AvatarImage src={avatarSrc} alt="Avatar" />
                  <AvatarFallback>{(user || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={uploadAvatarMutation.isPending}
                    onClick={() => document.getElementById("avatar-upload")?.click()}
                  >
                    <Camera className="h-4 w-4" />
                    {uploadAvatarMutation.isPending ? "Envoi..." : "Changer la photo"}
                  </Button>
                  {profile?.avatar_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      disabled={deleteAvatarMutation.isPending}
                      onClick={() => deleteAvatarMutation.mutate()}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </Button>
                  )}
                </div>
              </div>
              <input
                id="avatar-upload"
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

            <div className="grid gap-2">
              <Label>Date de naissance</Label>
              <Input
                type="date"
                {...profileForm.register("birthdate")}
              />
              {profileForm.formState.errors.birthdate && (
                <p className="text-xs text-destructive" role="alert" aria-live="assertive">{profileForm.formState.errors.birthdate.message}</p>
              )}
            </div>

            {/* Phone */}
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Telephone</Label>
              <Input
                id="edit-phone"
                type="tel"
                placeholder="06 12 34 56 78"
                {...profileForm.register("phone")}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={updateProfile.isPending} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                Enregistrer
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsEditSheetOpen(false)} disabled={updateProfile.isPending}>
                Annuler
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Password change bottom sheet */}
      <Sheet open={isPasswordSheetOpen} onOpenChange={setIsPasswordSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Changer le mot de passe</SheetTitle>
            <SheetDescription>Votre mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleUpdatePassword} className="space-y-3 mt-4">
            <div className="grid gap-2">
              <Label>Nouveau mot de passe</Label>
              <Input type="password" {...passwordForm.register("password")} placeholder="••••••••" />
              {passwordForm.formState.errors.password && (
                <p className="text-xs text-destructive" role="alert" aria-live="assertive">{passwordForm.formState.errors.password.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Confirmer</Label>
              <Input type="password" {...passwordForm.register("confirmPassword")} placeholder="••••••••" />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive" role="alert" aria-live="assertive">{passwordForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={updatePassword.isPending}>
              Mettre à jour le mot de passe
            </Button>
          </form>
        </SheetContent>
      </Sheet>
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

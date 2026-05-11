import * as React from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ShieldCheck, UserMinus, UserPlus, Search, CheckCircle, XCircle, Clock, Pen, Save, History, Sun } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import {
  summarizeApiError,
  type UserSummary,
  getAuditLog,
  type AuditEntry,
  listUsers,
  createCoach as createCoachApi,
  updateUserRole as updateUserRoleApi,
  disableUser as disableUserApi,
  getPendingApprovals,
  getProfile,
  getGroups,
  updateProfile,
} from "@/lib/api";
import { getAppSettings, updateAppSettings } from "@/lib/api/records";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const userRoleOptions = ["athlete", "coach", "comite", "admin"] as const;
type UserRole = (typeof userRoleOptions)[number];

const isActiveUser = (isActive: boolean | number | null | undefined) => !(isActive === false || isActive === 0);

const coachCreationSchema = z.object({
  display_name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  email: z.string().optional().refine(
    (val) => !val || z.string().email().safeParse(val).success,
    "L'email doit être valide"
  ),
  password: z.string().optional().refine(
    (val) => !val || (
      val.length >= 8 &&
      /[A-Z]/.test(val) &&
      /\d/.test(val)
    ),
    "Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre"
  ),
});

type CoachCreationForm = z.infer<typeof coachCreationSchema>;

const adminProfileEditSchema = z.object({
  display_name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  group_id: z.string().optional(),
  bio: z.string().optional(),
  birthdate: z.string().optional().refine(
    (val) => {
      if (!val) return true;
      const date = new Date(val);
      if (isNaN(date.getTime())) return false;
      const age = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      return age >= 3 && age <= 100;
    },
    { message: "L'âge doit être entre 3 et 100 ans" }
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

type AdminProfileEditForm = z.infer<typeof adminProfileEditSchema>;

export const updateUserRoleInList = (users: UserSummary[], userId: number, role: UserRole) =>
  users.map((user) => (user.id === userId ? { ...user, role } : user));

const parseErrorMessage = (error: unknown, fallbackMessage: string) =>
  summarizeApiError(error, fallbackMessage).message;

type AdminMutationAction = "createCoach" | "updateUserRole" | "disableUser";
type AdminMutationStatus = string;

export function getAdminMutationFeedback(action: AdminMutationAction, status: AdminMutationStatus) {
  if (status === "skipped") {
    return {
      shouldInvalidate: false,
      shouldApplyOptimisticData: false,
      title: "Action non executee",
      description: "Cette action n'a pas ete envoyee car Supabase n'est pas disponible dans cet environnement.",
    };
  }

  if (action === "createCoach") {
    return {
      shouldInvalidate: true,
      shouldApplyOptimisticData: false,
      title: "Coach cree",
      description: null,
    };
  }

  if (action === "updateUserRole") {
    return {
      shouldInvalidate: true,
      shouldApplyOptimisticData: true,
      title: "Role mis a jour",
      description: null,
    };
  }

  return {
    shouldInvalidate: true,
    shouldApplyOptimisticData: false,
    title: "Compte desactive",
    description: null,
  };
}

export default function Admin() {
  const { useMemo, useState } = React;
  const role = typeof window === "undefined" ? useAuth.getState().role : useAuth((state) => state.role);
  const userId = useAuth((state) => state.userId);
  const queryClient = useQueryClient();

  const [searchValue, setSearchValue] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [usersShown, setUsersShown] = useState(50);
  const [fichesShown, setFichesShown] = useState(50);

  const [createdCoachPassword, setCreatedCoachPassword] = useState<string | null>(null);
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [rejectPending, setRejectPending] = useState<{ userId: number; displayName: string } | null>(null);
  const [disablePending, setDisablePending] = useState<{ userId: number; displayName: string } | null>(null);
  const [ficheSearch, setFicheSearch] = useState("");

  const debouncedSearchValue = useDebouncedValue(searchValue, 200);
  const debouncedFicheSearch = useDebouncedValue(ficheSearch, 200);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CoachCreationForm>({
    resolver: zodResolver(coachCreationSchema),
    defaultValues: {
      display_name: "",
      email: "",
      password: "",
    },
  });

  const isAdmin = role === "admin";

  const { data: users = [], isLoading: usersLoading, error: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-users", includeInactive],
    queryFn: () => listUsers({ includeInactive }),
    enabled: isAdmin,
  });

  const createCoach = useMutation({
    mutationFn: (payload: { display_name: string; email?: string; password?: string }) => createCoachApi(payload),
    onMutate: () => {
      setCreatedCoachPassword(null);
    },
    onSuccess: (data) => {
      const feedback = getAdminMutationFeedback("createCoach", data.status);
      if (feedback.shouldInvalidate) {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        reset();
        setCreatedCoachPassword(data.initialPassword ?? null);
      }
      toast(feedback.title, { description: feedback.description ?? undefined });
    },
    onError: (error: unknown) => {
      toast("Erreur création coach", { description: parseErrorMessage(error, "Impossible de créer le coach.") });
    },
  });

  const updateUserRole = useMutation({
    mutationFn: (payload: { userId: number; role: UserRole }) => updateUserRoleApi(payload),
    onSuccess: (data, variables) => {
      const feedback = getAdminMutationFeedback("updateUserRole", data.status);
      if (feedback.shouldApplyOptimisticData) {
        queryClient.setQueryData<UserSummary[]>(["admin-users", includeInactive], (current) =>
          current ? updateUserRoleInList(current, variables.userId, variables.role) : current,
        );
      }
      if (feedback.shouldInvalidate) {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      }
      toast(feedback.title, { description: feedback.description ?? undefined });
    },
    onError: (error: unknown) => {
      toast("Erreur mise à jour rôle", { description: parseErrorMessage(error, "Impossible de mettre à jour le rôle.") });
    },
  });

  const disableUser = useMutation({
    mutationFn: (payload: { userId: number }) => disableUserApi(payload),
    onSuccess: (data) => {
      const feedback = getAdminMutationFeedback("disableUser", data.status);
      if (feedback.shouldInvalidate) {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      }
      toast(feedback.title, { description: feedback.description ?? undefined });
    },
    onError: (error: unknown) => {
      toast("Erreur désactivation", { description: parseErrorMessage(error, "Impossible de désactiver le compte.") });
    },
  });

  const { data: pendingApprovals = [], error: approvalsError, refetch: refetchApprovals } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: () => getPendingApprovals(),
    enabled: isAdmin,
  });

  const approveUser = useMutation({
    mutationFn: async (userId: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: "approve_user", user_id: userId }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] });
      toast("Inscription validée");
    },
    onError: (error: unknown) => {
      toast("Erreur validation", { description: parseErrorMessage(error, "Impossible de valider l'inscription.") });
    },
  });

  const rejectUser = useMutation({
    mutationFn: async (userId: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: "reject_user", user_id: userId }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] });
      toast("Inscription rejetée");
    },
    onError: (error: unknown) => {
      toast("Erreur rejet", { description: parseErrorMessage(error, "Impossible de rejeter l'inscription.") });
    },
  });

  const profileEditForm = useForm<AdminProfileEditForm>({
    resolver: zodResolver(adminProfileEditSchema),
    defaultValues: { display_name: "", group_id: "", bio: "", birthdate: "", ffn_iuf: "", phone: "" },
  });

  const { data: selectedProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["admin-user-profile", selectedUserId],
    queryFn: () => getProfile({ userId: selectedUserId }),
    enabled: !!selectedUserId,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: () => getGroups(),
    enabled: isAdmin,
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: () => getAuditLog(50, 0),
    enabled: isAdmin,
  });

  const { data: darkModeSetting } = useQuery({
    queryKey: ["app-setting", "dark_mode"],
    queryFn: () => getAppSettings("dark_mode"),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const darkModeValue: string = (() => {
    if (darkModeSetting == null) return "system";
    if (typeof darkModeSetting === "string") return darkModeSetting;
    if (typeof darkModeSetting === "object" && "mode" in darkModeSetting) return String(darkModeSetting.mode);
    return "system";
  })();

  const updateDarkMode = useMutation({
    mutationFn: (mode: string) => updateAppSettings("dark_mode", { mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-setting", "dark_mode"] });
      toast("Apparence mise à jour");
    },
    onError: (error: unknown) => {
      toast("Erreur", { description: parseErrorMessage(error, "Impossible de mettre à jour l'apparence.") });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: AdminProfileEditForm) =>
      updateProfile({
        userId: selectedUserId,
        profile: {
          display_name: data.display_name.trim(),
          group_id: data.group_id ? Number(data.group_id) : null,
          group_label: data.group_id
            ? groups.find((g) => g.id === Number(data.group_id))?.name ?? null
            : null,
          birthdate: data.birthdate || null,
          bio: data.bio || null,
          ffn_iuf: (data.ffn_iuf || "").trim() || null,
          phone: data.phone || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-profile", selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setIsProfileEditOpen(false);
      toast("Fiche mise à jour");
    },
    onError: (error: unknown) => {
      toast("Erreur mise à jour", { description: parseErrorMessage(error, "Impossible de mettre à jour la fiche.") });
    },
  });

  const startProfileEditFor = (uid: number) => {
    setSelectedUserId(uid);
    setIsProfileEditOpen(true);
  };

  const existingAdminId = useMemo(() => {
    const existingAdmin = users.find((user) => user.role === "admin");
    return existingAdmin?.id ?? null;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = debouncedSearchValue.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) {
        return false;
      }
      const displayName = user.display_name?.toLowerCase() ?? "";
      const email = user.email?.toLowerCase() ?? "";
      if (normalizedSearch && !displayName.includes(normalizedSearch) && !email.includes(normalizedSearch)) {
        return false;
      }
      return true;
    });
  }, [users, roleFilter, debouncedSearchValue]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return users.find((user) => user.id === selectedUserId) ?? null;
  }, [selectedUserId, users]);

  const ficheFilteredUsers = useMemo(() => {
    const q = debouncedFicheSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.display_name?.toLowerCase() ?? "").includes(q) ||
      (u.email?.toLowerCase() ?? "").includes(q),
    );
  }, [users, debouncedFicheSearch]);

  // Reset pagination when filters change
  React.useEffect(() => { setUsersShown(50); }, [debouncedSearchValue, roleFilter, includeInactive]);
  React.useEffect(() => { setFichesShown(50); }, [debouncedFicheSearch]);

  // Populate form when profile data arrives while sheet is open
  React.useEffect(() => {
    if (!isProfileEditOpen || !selectedProfile || !selectedUser) return;
    profileEditForm.reset({
      display_name: selectedUser.display_name || "",
      group_id: selectedProfile.group_id ? String(selectedProfile.group_id) : "",
      bio: selectedProfile.bio || "",
      birthdate: selectedProfile.birthdate ? String(selectedProfile.birthdate).split("T")[0] : "",
      ffn_iuf: selectedProfile.ffn_iuf ? String(selectedProfile.ffn_iuf) : "",
      phone: selectedProfile.phone || "",
    });
  }, [isProfileEditOpen, selectedProfile, selectedUser]);

  if (!isAdmin) {
    if (typeof window === "undefined") {
      return null;
    }
    return <Redirect to="/" />;
  }

  if (usersError || approvalsError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold">Impossible de charger les données</h3>
        <p className="text-sm text-muted-foreground mt-2">
          {usersError instanceof Error ? usersError.message : approvalsError instanceof Error ? approvalsError.message : "Une erreur s'est produite"}
        </p>
        <Button variant="default" onClick={() => {
          refetchUsers();
          refetchApprovals();
        }} className="mt-4 h-12 md:h-10">
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Administration</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>Accès admin</span>
        </div>
      </div>

      {pendingApprovals.length > 0 ? (
        <Card className="border-status-warning/30 bg-status-warning-bg dark:border-status-warning/30 dark:bg-status-warning-bg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-status-warning" />
              Inscriptions en attente
              <Badge variant="secondary" className="ml-2">{pendingApprovals.length}</Badge>
            </CardTitle>
            <CardDescription>
              Ces utilisateurs ont créé un compte et attendent votre validation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingApprovals.map((pending) => (
                <div
                  key={pending.user_id}
                  className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{pending.display_name}</p>
                    <p className="text-sm text-muted-foreground">{pending.email || "Pas d'email"}</p>
                    <p className="text-xs text-muted-foreground">
                      Inscrit le {new Date(pending.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-status-success hover:opacity-90 text-white h-10"
                      onClick={() => approveUser.mutate(pending.user_id)}
                      disabled={approveUser.isPending || rejectUser.isPending}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approuver
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setRejectPending({ userId: pending.user_id, displayName: pending.display_name })}
                      disabled={approveUser.isPending || rejectUser.isPending}
                      className="h-10"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Rejeter
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Créer un coach</CardTitle>
          <CardDescription>
            Laissez le mot de passe vide pour en générer un automatiquement (affiché une seule fois).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={handleSubmit((data) => {
              createCoach.mutate({
                display_name: data.display_name.trim(),
                email: data.email?.trim() || undefined,
                password: data.password || undefined,
              });
            })}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="coach-create-name">Nom affiché</Label>
                <Input
                  id="coach-create-name"
                  {...register("display_name")}
                  placeholder="Ex: Coach Martin"
                  maxLength={100}
                />
                {errors.display_name && (
                  <p className="text-sm text-destructive" role="alert" aria-live="assertive">{errors.display_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="coach-create-email">Email</Label>
                <Input
                  id="coach-create-email"
                  type="email"
                  {...register("email")}
                  placeholder="coach@email.com"
                />
                {errors.email && (
                  <p className="text-sm text-destructive" role="alert" aria-live="assertive">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="coach-create-password">Mot de passe (optionnel)</Label>
                <Input
                  id="coach-create-password"
                  type="text"
                  {...register("password")}
                  placeholder="Laisser vide pour auto"
                />
                {errors.password && (
                  <p className="text-sm text-destructive" role="alert" aria-live="assertive">{errors.password.message}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="default" type="submit" disabled={createCoach.isPending} className="h-10">
                {createCoach.isPending ? "Création..." : "Créer le coach"}
              </Button>
              {createdCoachPassword ? (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
                  <p className="font-medium text-primary">Mot de passe initial (à copier)</p>
                  <p className="font-mono">{createdCoachPassword}</p>
                </div>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
        <CardTitle>Gestion des comptes</CardTitle>
        <CardDescription>Mettre à jour les rôles, filtrer et désactiver les comptes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="admin-search">Recherche</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="admin-search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Nom ou email"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as "all" | UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="athlete">Athlète</SelectItem>
                  <SelectItem value="coach">Entraineur EAC</SelectItem>
                  <SelectItem value="comite">Comité</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} id="inactive-toggle" />
              <Label htmlFor="inactive-toggle" className="text-sm">
                Inclure désactivés
              </Label>
            </div>
          </div>

          {usersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="flex items-center gap-4 p-3 rounded-lg border">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : filteredUsers.length ? (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.slice(0, usersShown).map((user) => {
                    const active = isActiveUser(user.is_active);
                    const isSelf = userId === user.id;
                    const disableAdminOption = existingAdminId !== null && existingAdminId !== user.id;
                    return (
                      <TableRow key={user.id} data-selected={selectedUserId === user.id}>
                        <TableCell className="font-medium">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-2"
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            {user.display_name}
                          </Button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{user.email || "-"}</TableCell>
                        <TableCell>
                          <Select
                            value={user.role}
                            onValueChange={(value) => {
                              if (!userRoleOptions.includes(value as UserRole)) return;
                              if (!user.id) return;
                              if (value === user.role) return;
                              updateUserRole.mutate({ userId: user.id, role: value as UserRole });
                            }}
                            disabled={!active || updateUserRole.isPending}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="athlete">Athlète</SelectItem>
                              <SelectItem value="coach">Entraineur EAC</SelectItem>
                              <SelectItem value="comite">Comité</SelectItem>
                              <SelectItem value="admin" disabled={disableAdminOption}>
                                Admin
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {active ? <Badge variant="secondary">Actif</Badge> : <Badge variant="outline">Désactivé</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (!user.id) return;
                              if (isSelf) {
                                toast("Action impossible", { description: "Vous ne pouvez pas désactiver votre propre compte." });
                                return;
                              }
                              setDisablePending({ userId: user.id, displayName: user.display_name });
                            }}
                            disabled={!active || disableUser.isPending || isSelf}
                            className="h-10"
                          >
                            <UserMinus className="mr-2 h-4 w-4" />
                            Désactiver
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filteredUsers.length > usersShown && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <p className="text-xs text-muted-foreground">
                    {usersShown} sur {filteredUsers.length} utilisateurs
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setUsersShown((s) => s + 50)}>
                    Voir plus
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserPlus className="h-4 w-4" />
              Aucun utilisateur ne correspond à votre recherche.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fiches utilisateurs</CardTitle>
          <CardDescription>Tapez sur un compte pour voir et modifier sa fiche.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search within fiches */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={ficheSearch}
              onChange={(e) => setFicheSearch(e.target.value)}
              placeholder="Rechercher un nom..."
              className="pl-9"
            />
          </div>

          {usersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={`fiche-sk-${i}`} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : ficheFilteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun résultat.</p>
          ) : (
            <div className="space-y-1.5">
              {ficheFilteredUsers.slice(0, fichesShown).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full flex items-center gap-3 rounded-lg border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => { setSelectedUserId(u.id); startProfileEditFor(u.id); }}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.display_name)}`} alt={u.display_name} />
                    <AvatarFallback className="text-xs">{(u.display_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{u.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email || "-"}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{u.role}</Badge>
                  <Pen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
          {ficheFilteredUsers.length > fichesShown && (
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="text-xs text-muted-foreground">
                {fichesShown} sur {ficheFilteredUsers.length} fiches
              </p>
              <Button variant="outline" size="sm" onClick={() => setFichesShown((s) => s + 50)}>
                Voir plus
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apparence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-muted-foreground" />
            Apparence
          </CardTitle>
          <CardDescription>Thème de couleur de l'application pour tous les utilisateurs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label htmlFor="dark-mode-select" className="shrink-0">Mode</Label>
            <Select
              value={darkModeValue}
              onValueChange={(value) => updateDarkMode.mutate(value)}
              disabled={updateDarkMode.isPending}
            >
              <SelectTrigger id="dark-mode-select" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Système</SelectItem>
                <SelectItem value="light">Clair</SelectItem>
                <SelectItem value="dark">Sombre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit log */}
      {auditLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Historique des actions
            </CardTitle>
            <CardDescription>Actions récentes effectuées via l'administration.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {auditLog.map((entry) => {
                const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
                  create_coach: { label: "Création coach", variant: "default" },
                  update_role: { label: "Changement rôle", variant: "secondary" },
                  update_password: { label: "Mot de passe", variant: "outline" },
                  disable_user: { label: "Désactivation", variant: "destructive" },
                  approve_user: { label: "Approbation", variant: "default" },
                  reject_user: { label: "Rejet", variant: "destructive" },
                };
                const actionInfo = actionLabels[entry.action] ?? { label: entry.action, variant: "outline" as const };
                const date = new Date(entry.created_at);
                const formattedDate = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
                const formattedTime = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={entry.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                    <Badge variant={actionInfo.variant} className="text-[10px] shrink-0">{actionInfo.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{entry.actor_name}</span>
                      {entry.target_user_id && (
                        <span className="text-muted-foreground"> &rarr; {entry.target_name}</span>
                      )}
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <span className="text-muted-foreground text-xs ml-1">
                          ({Object.entries(entry.details).map(([k, v]) => `${k}: ${v}`).join(", ")})
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{formattedDate} {formattedTime}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile edit bottom sheet */}
      <Sheet open={isProfileEditOpen} onOpenChange={setIsProfileEditOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Modifier la fiche — {selectedUser?.display_name}</SheetTitle>
            <SheetDescription>Modifiez les informations du profil utilisateur.</SheetDescription>
          </SheetHeader>
          <form
            onSubmit={profileEditForm.handleSubmit((data) => updateProfileMutation.mutate(data))}
            className="space-y-4 mt-4"
          >
            <div className="grid gap-2">
              <Label>Nom affiché</Label>
              <Input {...profileEditForm.register("display_name")} maxLength={100} />
              {profileEditForm.formState.errors.display_name && (
                <p className="text-xs text-destructive">{profileEditForm.formState.errors.display_name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Groupe</Label>
              <Select
                value={profileEditForm.watch("group_id")}
                onValueChange={(value) => profileEditForm.setValue("group_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un groupe" />
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

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Date de naissance</Label>
                <Input type="date" {...profileEditForm.register("birthdate")} />
                {profileEditForm.formState.errors.birthdate && (
                  <p className="text-xs text-destructive">{profileEditForm.formState.errors.birthdate.message}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Téléphone</Label>
                <Input type="tel" placeholder="06 12 34 56 78" maxLength={20} {...profileEditForm.register("phone")} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>IUF FFN</Label>
              <Input placeholder="879576" inputMode="numeric" {...profileEditForm.register("ffn_iuf")} />
              {profileEditForm.formState.errors.ffn_iuf && (
                <p className="text-xs text-destructive">{profileEditForm.formState.errors.ffn_iuf.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Bio</Label>
              <Textarea {...profileEditForm.register("bio")} rows={3} maxLength={500} />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={updateProfileMutation.isPending} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                {updateProfileMutation.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsProfileEditOpen(false)} disabled={updateProfileMutation.isPending}>
                Annuler
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={rejectPending !== null} onOpenChange={(open) => { if (!open) setRejectPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeter cette inscription ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le compte de &laquo; {rejectPending?.displayName} &raquo; sera désactivé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (rejectPending) rejectUser.mutate(rejectPending.userId);
                setRejectPending(null);
              }}
            >
              Rejeter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={disablePending !== null} onOpenChange={(open) => { if (!open) setDisablePending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le compte de &laquo; {disablePending?.displayName} &raquo; sera désactivé. Cette action peut être annulée manuellement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (disablePending) disableUser.mutate({ userId: disablePending.userId });
                setDisablePending(null);
              }}
            >
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

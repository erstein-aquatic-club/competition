import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getGroups } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordStrength } from "@/components/shared/PasswordStrength";
import { LoginInstallBanner } from "@/components/shared/LoginInstallBanner";
import { fadeIn, staggerChildren } from "@/lib/animations";
import { durationsSeconds } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
const eacLogo = `${import.meta.env.BASE_URL}logo-eac-256.webp`;
import { getLandingRouteForRole } from "@/pages/loginHelpers";

// Validation schemas
const loginSchema = z.object({
  email: z.string().min(1, "Email requis").email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

const signupSchema = z.object({
  name: z.string().min(2, "Minimum 2 caractères"),
  email: z.string().min(1, "Email requis").email("Email invalide"),
  role: z.enum(["athlete", "coach"], { required_error: "Rôle requis" }),
  birthdate: z.string().min(1, "Date de naissance requise").refine((val) => {
    const date = new Date(val);
    if (Number.isNaN(date.getTime())) return false;
    const age = (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return age >= 6 && age <= 100;
  }, "Utilisez le sélecteur de date ou le format AAAA-MM-JJ"),
  sex: z.enum(["M", "F"], { required_error: "Sexe requis" }),
  groupId: z.string().min(1, "Groupe requis"),
  phone: z.string().min(1, "Téléphone requis"),
  password: z.string()
    .min(8, "Minimum 8 caractères")
    .regex(/[A-Z]/, "Au moins une majuscule")
    .regex(/[0-9]/, "Au moins un chiffre"),
});

const resetPasswordSchema = z.object({
  email: z.string().min(1, "Email requis").email("Email invalide"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;
type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function Login() {
  const reduceMotion = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [signupStep, setSignupStep] = useState(1);
  const { loginFromSession, loadUser } = useAuth();
  const [, setLocation] = useLocation();

  // React Hook Form instances
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "athlete",
      birthdate: "",
      sex: undefined,
      groupId: "",
      phone: "",
      password: "",
    },
  });

  const resetPasswordForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: "" },
  });

  const { data: groups = [], isLoading: groupsLoading, isError: groupsError } = useQuery({
    queryKey: ["register-groups"],
    queryFn: () => getGroups(),
    enabled: activeTab === "signup",
    retry: 2,
  });

  // Set default group when groups load
  useEffect(() => {
    if (activeTab !== "signup") return;
    const currentGroupId = signupForm.watch("groupId");
    if (!currentGroupId && groups.length > 0) {
      signupForm.setValue("groupId", String(groups[0].id));
    }
  }, [groups, activeTab, signupForm]);

  const formatAuthError = (message: string) => {
    if (message.includes("Invalid login")) {
      return "Identifiant ou mot de passe incorrect.";
    }
    if (message.includes("Email not confirmed")) {
      return "Veuillez confirmer votre email avant de vous connecter.";
    }
    return message;
  };

  const handleLogin = async (data: LoginFormData) => {
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email.trim(),
        password: data.password,
      });
      if (authError) {
        throw new Error(formatAuthError(authError.message));
      }
      if (!authData.session) {
        throw new Error("Session non reçue.");
      }
      loginFromSession(authData.session);
      const hydrated = await loadUser();
      if (!hydrated) {
        throw new Error("Impossible de récupérer le profil utilisateur.");
      }
      const resolvedRole = useAuth.getState().role;
      setLocation(getLandingRouteForRole(resolvedRole), { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connexion impossible.";
      setError(message);
    }
  };

  const handleSignup = async (data: SignupFormData) => {
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          emailRedirectTo: window.location.origin + "/competition/#/",
          data: {
            display_name: data.name.trim(),
            role: data.role,
            birthdate: data.birthdate,
            group_id: Number(data.groupId),
            sex: data.sex,
            phone: data.phone.trim(),
          },
        },
      });
      if (signUpError) {
        throw new Error(signUpError.message);
      }
      if (authData.user) {
        // Athletes can login immediately, coaches need approval
        if (data.role === "athlete") {
          // Auto-login for athletes
          const { data: sessionData } = await supabase.auth.signInWithPassword({
            email: data.email.trim(),
            password: data.password,
          });
          if (sessionData?.session) {
            loginFromSession(sessionData.session);
            await loadUser();
            setLocation("/", { replace: true });
          }
        } else {
          // Coaches must wait for approval
          await supabase.auth.signOut();
          setSignupComplete(true);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Création impossible.";
      signupForm.setError("root", { message });
    }
  };

  const handleResetPassword = async (data: ResetPasswordFormData) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email.trim(), {
        redirectTo: window.location.origin + "/competition/#/reset-password",
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'envoi";
      resetPasswordForm.setError("root", { message });
    }
  };

  return (
    <div className="min-h-[100dvh] lg:min-h-screen lg:grid lg:grid-cols-2 bg-background">
      {/* Hero Section — Desktop only */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        className="hidden lg:flex flex-col items-center justify-center p-12 bg-gradient-to-br from-primary via-primary/90 to-primary/80 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.08),transparent_40%)]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: durationsSeconds.slow, delay: durationsSeconds.normal }}
          className="relative z-10 text-center space-y-8"
        >
          <img src={eacLogo} alt="EAC Logo" className="h-32 w-32 mx-auto drop-shadow-2xl" />
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-display font-bold text-white tracking-tight">
              SUIVI NATATION
            </h1>
            <p className="text-lg md:text-xl text-white/90 max-w-md mx-auto">
              Plateforme d'entraînement pour l'Erstein Aquatic Club
            </p>
          </div>
        </motion.div>
      </motion.div>

      {/* Form Section — mobile: light with EAC accent | desktop: light classic */}
      <div className="flex flex-col min-h-[100dvh] lg:min-h-0 relative overflow-hidden bg-background">
        {/* Mobile decorative background — red accent band */}
        <div className="lg:hidden absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-b from-white via-background to-muted/50" />
          <div className="absolute top-0 inset-x-0 h-[120px] bg-primary" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative z-10">
          {/* Mobile logo — on the red band */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durationsSeconds.medium }}
            className="lg:hidden mb-10 text-center"
          >
            <div className="relative inline-block">
              <img
                src={eacLogo}
                alt="EAC Logo"
                className="relative h-24 w-24 mx-auto rounded-full ring-4 ring-white shadow-lg"
              />
            </div>
            <h1 className="text-3xl font-display font-bold text-center mt-6 tracking-tight text-foreground">
              SUIVI <span className="text-primary">NATATION</span>
            </h1>
            <p className="text-[11px] text-muted-foreground text-center mt-2 uppercase tracking-[0.3em] font-bold">
              Erstein Aquatic Club
            </p>
          </motion.div>

          {/* Desktop logo — original */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden lg:block mb-8"
          >
            <img src={eacLogo} alt="EAC Logo" className="h-20 w-20 mx-auto" />
            <h1 className="text-2xl font-display font-bold text-center mt-4 text-foreground">
              SUIVI <span className="text-primary">NATATION</span>
            </h1>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={reduceMotion ? undefined : staggerChildren}
            className="w-full max-w-md"
          >
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "login" | "signup"); setSignupStep(1); }} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="login" className="text-sm font-medium">
                  Connexion
                </TabsTrigger>
                <TabsTrigger value="signup" className="text-sm font-medium">
                  Inscription
                </TabsTrigger>
              </TabsList>

              {/* Login Tab */}
              <TabsContent value="login" className="space-y-6">
                <form
                  onSubmit={loginForm.handleSubmit(handleLogin)}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="prenom.nom@email.com"
                      {...loginForm.register("email")}
                      className="min-h-12"
                      autoFocus
                    />
                    {loginForm.formState.errors.email && (
                      <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                        {loginForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Votre mot de passe"
                        {...loginForm.register("password")}
                        className="min-h-12 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {loginForm.formState.errors.password && (
                      <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                        {loginForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  {error && (
                    <div
                      className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                      role="alert"
                      aria-live="assertive"
                    >
                      {error}
                    </div>
                  )}

                  <div>
                    <Button
                      type="submit"
                      className="w-full min-h-12 text-base font-semibold"
                      disabled={loginForm.formState.isSubmitting}
                    >
                      {loginForm.formState.isSubmitting ? "Connexion..." : "SE CONNECTER"}
                    </Button>
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(true);
                        const email = loginForm.getValues("email").trim();
                        resetPasswordForm.setValue("email", email);
                      }}
                      className="text-sm text-muted-foreground hover:text-primary underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                </form>
              </TabsContent>

              {/* Signup Tab */}
              <TabsContent value="signup" className="space-y-6">
                <form
                  onSubmit={signupForm.handleSubmit(handleSignup)}
                  className="space-y-4"
                >
                  {/* Progress indicator */}
                  <div className="flex items-center justify-center gap-2 mb-6">
                    {[1, 2, 3].map((s) => (
                      <div
                        key={s}
                        className={cn(
                          "h-2 rounded-full transition-all",
                          s === signupStep ? "w-8 bg-primary" : s < signupStep ? "w-2 bg-primary/50" : "w-2 bg-muted"
                        )}
                      />
                    ))}
                  </div>

                  {/* Step labels */}
                  {signupStep === 1 && <p className="text-sm font-medium mb-3">1/3 — Identité</p>}
                  {signupStep === 2 && <p className="text-sm font-medium mb-3">2/3 — Profil</p>}
                  {signupStep === 3 && <p className="text-sm font-medium mb-3">3/3 — Club</p>}

                  {/* Step 1 — Identité */}
                  {signupStep === 1 && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="signup-name">Nom d'affichage</Label>
                        <Input
                          id="signup-name"
                          {...signupForm.register("name", {
                            setValueAs: (v) => v?.trim()
                          })}
                          placeholder="Votre nom"
                          className="min-h-12"
                          maxLength={100}
                          autoFocus
                        />
                        {signupForm.formState.errors.name && (
                          <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                            {signupForm.formState.errors.name.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-email">Email</Label>
                        <Input
                          id="signup-email"
                          type="email"
                          {...signupForm.register("email")}
                          placeholder="prenom.nom@email.com"
                          className="min-h-12"
                        />
                        {signupForm.formState.errors.email && (
                          <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                            {signupForm.formState.errors.email.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-password">Mot de passe</Label>
                        <div className="relative">
                          <Input
                            id="signup-password"
                            type={showSignupPassword ? "text" : "password"}
                            {...signupForm.register("password")}
                            placeholder="Choisissez un mot de passe"
                            className="min-h-12 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSignupPassword(!showSignupPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={showSignupPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                          >
                            {showSignupPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        {signupForm.formState.errors.password && (
                          <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                            {signupForm.formState.errors.password.message}
                          </p>
                        )}
                        <PasswordStrength password={signupForm.watch("password")} />
                      </div>

                      <Button
                        type="button"
                        className="w-full min-h-12 text-base font-semibold"
                        onClick={async () => {
                          const valid = await signupForm.trigger(["name", "email", "password"]);
                          if (valid) setSignupStep(2);
                        }}
                      >
                        Suivant
                      </Button>
                    </>
                  )}

                  {/* Step 2 — Profil */}
                  {signupStep === 2 && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="signup-role">Je m'inscris en tant que</Label>
                        <Select
                          value={signupForm.watch("role")}
                          onValueChange={(value) => signupForm.setValue("role", value as "athlete" | "coach")}
                        >
                          <SelectTrigger id="signup-role" className="min-h-12">
                            <SelectValue placeholder="Sélectionnez votre rôle" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="athlete">Athlète</SelectItem>
                            <SelectItem value="coach">Coach / Entraineur</SelectItem>
                          </SelectContent>
                        </Select>
                        {signupForm.formState.errors.role && (
                          <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                            {signupForm.formState.errors.role.message}
                          </p>
                        )}
                        {signupForm.watch("role") === "coach" && (
                          <p className="text-xs text-muted-foreground">
                            Les comptes coachs nécessitent une validation par un administrateur
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="signup-birthdate">Date de naissance</Label>
                          <Input
                            id="signup-birthdate"
                            type="date"
                            {...signupForm.register("birthdate")}
                            className="min-h-12"
                            max={new Date().toISOString().split('T')[0]}
                          />
                          {signupForm.formState.errors.birthdate ? (
                            <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                              {signupForm.formState.errors.birthdate.message}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Cliquez sur l'icône calendrier
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="signup-sex">Sexe</Label>
                          <Select
                            value={signupForm.watch("sex")}
                            onValueChange={(value) => signupForm.setValue("sex", value as "M" | "F")}
                          >
                            <SelectTrigger id="signup-sex" className="min-h-12">
                              <SelectValue placeholder="Sélectionnez" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="M">Garçon</SelectItem>
                              <SelectItem value="F">Fille</SelectItem>
                            </SelectContent>
                          </Select>
                          {signupForm.formState.errors.sex && (
                            <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                              {signupForm.formState.errors.sex.message}
                            </p>
                          )}
                        </div>
                      </div>

                      <Button
                        type="button"
                        className="w-full min-h-12 text-base font-semibold"
                        onClick={async () => {
                          const valid = await signupForm.trigger(["role", "birthdate", "sex"]);
                          if (valid) setSignupStep(3);
                        }}
                      >
                        Suivant
                      </Button>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => setSignupStep((s) => s - 1)}
                          className="text-sm text-muted-foreground hover:underline"
                        >
                          &larr; Retour
                        </button>
                      </div>
                    </>
                  )}

                  {/* Step 3 — Club */}
                  {signupStep === 3 && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="signup-group">Groupe</Label>
                        <Select
                          value={signupForm.watch("groupId")}
                          onValueChange={(value) => signupForm.setValue("groupId", value)}
                          disabled={groupsLoading || groups.length === 0}
                        >
                          <SelectTrigger id="signup-group" className="min-h-12">
                            <SelectValue
                              placeholder={
                                groupsLoading
                                  ? "Chargement..."
                                  : groupsError
                                  ? "Erreur de chargement"
                                  : "Sélectionnez un groupe"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {groups.map((group) => (
                              <SelectItem key={group.id} value={String(group.id)}>
                                {group.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {signupForm.formState.errors.groupId && (
                          <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                            {signupForm.formState.errors.groupId.message}
                          </p>
                        )}
                      </div>

                      {/* Phone */}
                      <div className="space-y-2">
                        <Label htmlFor="signup-phone">Téléphone *</Label>
                        <Input
                          id="signup-phone"
                          type="tel"
                          placeholder="06 12 34 56 78"
                          maxLength={20}
                          {...signupForm.register("phone")}
                          className="min-h-12"
                        />
                        {signupForm.formState.errors.phone && (
                          <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                            {signupForm.formState.errors.phone.message}
                          </p>
                        )}
                      </div>

                      {signupForm.formState.errors.root && (
                        <div
                          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                          role="alert"
                          aria-live="assertive"
                        >
                          {signupForm.formState.errors.root.message}
                        </div>
                      )}

                      <div>
                        <Button
                          type="submit"
                          className="w-full min-h-12 text-base font-semibold"
                          disabled={signupForm.formState.isSubmitting}
                        >
                          {signupForm.formState.isSubmitting ? "Création..." : "CRÉER LE COMPTE"}
                        </Button>
                      </div>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => setSignupStep((s) => s - 1)}
                          className="text-sm text-muted-foreground hover:underline"
                        >
                          &larr; Retour
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </TabsContent>
            </Tabs>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: durationsSeconds.slow }}
            className="mt-10 text-center"
          >
            <div className="lg:hidden flex items-center justify-center gap-3 mb-3">
              <div className="h-px w-8 bg-primary/30" />
              <div className="h-1.5 w-1.5 rounded-full bg-primary/50" />
              <div className="h-px w-8 bg-primary/30" />
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.3em] font-bold">
              EAC Performance Tracking
            </p>
          </motion.div>

          <LoginInstallBanner />
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog
        open={signupComplete}
        onOpenChange={(open) => {
          setSignupComplete(open);
          if (!open) {
            setActiveTab("login");
            signupForm.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <div className="text-center space-y-4 py-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
            >
              <span className="text-3xl text-primary">&#10003;</span>
            </motion.div>
            <h2 className="text-xl font-semibold">Compte créé avec succès !</h2>
            <p className="text-sm text-muted-foreground">
              Un coach ou un administrateur doit valider votre inscription avant votre première connexion.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                setSignupComplete(false);
                setActiveTab("login");
              }}
            >
              Retour à la connexion
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Forgot Password Dialog */}
      <Dialog
        open={showForgotPassword}
        onOpenChange={(open) => {
          setShowForgotPassword(open);
          if (!open) {
            resetPasswordForm.reset();
            setResetSent(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {resetSent ? (
            <div className="text-center space-y-4 py-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted"
              >
                <span className="text-3xl text-primary">&#9993;</span>
              </motion.div>
              <h2 className="text-xl font-semibold">Email envoyé</h2>
              <p className="text-sm text-muted-foreground">
                Un email de réinitialisation a été envoyé. Vérifiez votre boîte de réception.
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetSent(false);
                }}
              >
                Retour à la connexion
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
                <DialogDescription>
                  Entrez votre adresse email pour recevoir un lien de réinitialisation.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={resetPasswordForm.handleSubmit(handleResetPassword)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    {...resetPasswordForm.register("email")}
                    placeholder="votre@email.com"
                    className="min-h-12"
                    autoFocus
                  />
                  {resetPasswordForm.formState.errors.email && (
                    <p className="text-xs text-destructive" role="alert" aria-live="assertive">
                      {resetPasswordForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                {resetPasswordForm.formState.errors.root && (
                  <div
                    className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive text-center"
                    role="alert"
                    aria-live="assertive"
                  >
                    {resetPasswordForm.formState.errors.root.message}
                  </div>
                )}

                <Button type="submit" className="w-full min-h-12" disabled={resetPasswordForm.formState.isSubmitting}>
                  {resetPasswordForm.formState.isSubmitting ? "Envoi..." : "Envoyer le lien"}
                </Button>

                <div className="flex justify-center">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-primary underline"
                    onClick={() => setShowForgotPassword(false)}
                  >
                    Retour à la connexion
                  </button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  FlaskConical, Bell, BellRing, CheckCircle2, AlertTriangle, XCircle, Info,
  ChevronLeft, Smartphone, Wifi, WifiOff, RefreshCw, Trash2, Vibrate,
  Clipboard, Send, Loader2, Copy,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { detectPlatform, isStandalone } from "../../lib/pwaHelpers";
import {
  isPushSupported, getPushPermission, subscribeToPush, hasActivePushSubscription,
} from "../../lib/push";
import { haptic } from "../../lib/haptic";

declare const __BUILD_TIMESTAMP__: string;

interface Props {
  onBack: () => void;
}

/** Carte de section, alignée sur le style de l'app (bordure + bg-card/50). */
function Section({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Ligne clé/valeur monospace pour les tableaux d'infos. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right font-mono text-foreground">{value}</span>
    </div>
  );
}

/**
 * §385/§386 — Page d'essais techniques (admin only). Bac à sable de diagnostic
 * « sur appareil réel » : toasts, infos appareil/environnement (build, PWA,
 * safe-area-insets pour la Dynamic Island), notifications push de bout en bout,
 * cache & service worker, haptique & presse-papier.
 */
export default function TechTestsScreen({ onBack }: Props) {
  const userId = useAuth((s) => s.userId);

  // --- État live -------------------------------------------------------------
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [insets, setInsets] = useState({ top: "—", right: "—", bottom: "—", left: "—" });
  const [swStatus, setSwStatus] = useState("…");
  const [pushPerm, setPushPerm] = useState<string>(isPushSupported() ? getPushPermission() : "non supporté");
  const [hasSub, setHasSub] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const platform = detectPlatform(navigator.userAgent);
  const standalone = isStandalone();
  const theme = document.documentElement.classList.contains("dark") ? "sombre" : "clair";
  const viewport = `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`;
  const build = (window as { __eacBuildTimestamp?: string }).__eacBuildTimestamp
    ?? (typeof __BUILD_TIMESTAMP__ !== "undefined" ? __BUILD_TIMESTAMP__ : "inconnu");

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Mesure réelle des safe-area-insets via une sonde (debug Dynamic Island).
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;" +
      "padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);" +
      "padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    setInsets({ top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft });
    document.body.removeChild(probe);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) { setSwStatus("non supporté"); return; }
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) setSwStatus("non enregistré");
      else setSwStatus(navigator.serviceWorker.controller ? "actif (contrôle la page)" : "enregistré");
    });
  }, []);

  useEffect(() => {
    if (isPushSupported()) hasActivePushSubscription().then(setHasSub);
    else setHasSub(false);
  }, []);

  // --- Handlers --------------------------------------------------------------
  const handleSubscribe = async () => {
    if (!userId) { toast.error("Utilisateur inconnu"); return; }
    setBusy("subscribe");
    try {
      const ok = await subscribeToPush(userId);
      setPushPerm(getPushPermission());
      setHasSub(await hasActivePushSubscription());
      ok ? toast.success("Notifications activées") : toast.error("Activation refusée ou échouée");
    } finally { setBusy(null); }
  };

  const handleTestPush = async () => {
    if (!userId) { toast.error("Utilisateur inconnu"); return; }
    setBusy("push");
    try {
      const { data, error } = await supabase.functions.invoke("push-send", {
        body: {
          title: "Test EAC Natation",
          body: "Push de test depuis Essais techniques 🏊",
          target_user_ids: [userId],
        },
      });
      if (error) { toast.error("Échec de l'envoi de la push"); return; }
      const sent = (data as { sent?: number } | null)?.sent ?? 0;
      sent > 0
        ? toast.success(`Push envoyée (${sent} appareil${sent > 1 ? "s" : ""})`)
        : toast("Aucun abonnement actif", { description: "Active d'abord les notifications ci-dessus." });
    } finally { setBusy(null); }
  };

  const handleClearCache = async () => {
    setBusy("cache");
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      toast.success("Cache vidé — rechargement…");
      setTimeout(() => location.reload(), 700);
    } catch {
      toast.error("Échec du nettoyage du cache");
      setBusy(null);
    }
  };

  const handleCopyInfo = async () => {
    const report = [
      `Build      : ${build}`,
      `Plateforme : ${platform}`,
      `PWA        : ${standalone ? "standalone" : "navigateur"}`,
      `Thème      : ${theme}`,
      `Viewport   : ${viewport}`,
      `Réseau     : ${online ? "en ligne" : "hors ligne"}`,
      `Safe-area  : top ${insets.top} / bottom ${insets.bottom} / left ${insets.left} / right ${insets.right}`,
      `SW         : ${swStatus}`,
      `Push       : ${pushPerm} / abonné ${hasSub ? "oui" : "non"}`,
      `UA         : ${navigator.userAgent}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      toast.success("Infos copiées dans le presse-papier");
    } catch {
      toast.error("Copie impossible sur cet appareil");
    }
  };

  const handleCopySample = async () => {
    try {
      await navigator.clipboard.writeText("Erstein Aquatic Club — test presse-papier");
      toast.success("Texte copié");
    } catch {
      toast.error("Presse-papier indisponible");
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Retour
        </Button>
        <h1 className="text-lg font-bold text-foreground">Essais techniques</h1>
      </div>

      {/* ---------------------------------------------------------------- Toasts */}
      <Section
        icon={<Bell className="h-4 w-4" />}
        title="Toasts"
        subtitle="Style pilule et positionnement sous la Dynamic Island."
      >
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast("Ceci est un toast de test")} className="gap-2">
            <FlaskConical className="h-4 w-4" />
            Test toast
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => toast.success("Opération réussie")}>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Succès
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => toast.error("Une erreur est survenue")}>
            <XCircle className="h-4 w-4 text-destructive" />
            Erreur
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => toast.warning("Attention, vérifie ceci")}>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Alerte
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => toast("Sauvegarde en attente", { description: "Renvoi automatique dès le retour réseau." })}
          >
            <Info className="h-4 w-4 text-primary" />
            Description
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => toast("Action requise", {
              action: { label: "Réessayer", onClick: () => toast.success("Réessayé") },
            })}
          >
            <Bell className="h-4 w-4" />
            Bouton
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const id = toast.loading("Chargement…");
              setTimeout(() => toast.success("Terminé", { id }), 1500);
            }}
          >
            <Loader2 className="h-4 w-4" />
            Loading → succès
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => toast.promise(
              new Promise((res) => setTimeout(res, 1500)),
              { loading: "Envoi…", success: "Envoyé", error: "Échec" },
            )}
          >
            <Send className="h-4 w-4" />
            Promise
          </Button>
        </div>
      </Section>

      {/* -------------------------------------------- Infos appareil & environnement */}
      <Section
        icon={<Smartphone className="h-4 w-4" />}
        title="Appareil & environnement"
        subtitle="Build, PWA, safe-area-insets (offset Dynamic Island), réseau."
      >
        <div className="rounded-xl border border-border bg-background/40 px-3 py-1.5">
          <Row label="Build" value={build} />
          <Row label="Plateforme" value={platform} />
          <Row label="Mode" value={standalone ? "PWA (standalone)" : "navigateur"} />
          <Row label="Thème" value={theme} />
          <Row label="Viewport" value={viewport} />
          <Row label="Réseau" value={online ? "en ligne" : "hors ligne"} />
          <Row label="Safe-area top" value={insets.top} />
          <Row label="Safe-area bottom" value={insets.bottom} />
          <Row label="Safe-area L / R" value={`${insets.left} / ${insets.right}`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={handleCopyInfo}>
            {online ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-destructive" />}
            <Copy className="h-4 w-4" />
            Copier le diagnostic
          </Button>
        </div>
      </Section>

      {/* ---------------------------------------------------- Notifications push */}
      <Section
        icon={<BellRing className="h-4 w-4" />}
        title="Notifications push"
        subtitle="Test de bout en bout (serveur → appareil) via push-send."
      >
        <div className="rounded-xl border border-border bg-background/40 px-3 py-1.5">
          <Row label="Support" value={isPushSupported() ? "oui" : "non"} />
          <Row label="Permission" value={pushPerm} />
          <Row label="Abonné" value={hasSub === null ? "…" : hasSub ? "oui" : "non"} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={!isPushSupported() || busy === "subscribe"}
            onClick={handleSubscribe}
          >
            {busy === "subscribe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4 text-primary" />}
            Activer les notifications
          </Button>
          <Button
            className="gap-2"
            disabled={busy === "push"}
            onClick={handleTestPush}
          >
            {busy === "push" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer une push test
          </Button>
        </div>
      </Section>

      {/* ----------------------------------------------- Haptique & presse-papier */}
      <Section
        icon={<Vibrate className="h-4 w-4" />}
        title="Haptique & presse-papier"
        subtitle={"vibrate" in navigator ? "Vibration supportée sur cet appareil." : "Vibration non supportée (iOS Safari)."}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => haptic.light()}>
            <Vibrate className="h-4 w-4" />
            Léger
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => haptic.medium()}>
            <Vibrate className="h-4 w-4" />
            Moyen
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => haptic.success()}>
            <Vibrate className="h-4 w-4 text-green-500" />
            Succès
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => haptic.error()}>
            <Vibrate className="h-4 w-4 text-destructive" />
            Erreur
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleCopySample}>
            <Clipboard className="h-4 w-4" />
            Copier un texte
          </Button>
        </div>
      </Section>

      {/* --------------------------------------------------- Cache & service worker */}
      <Section
        icon={<RefreshCw className="h-4 w-4" />}
        title="Cache & service worker"
        subtitle="État du SW et nettoyage forcé (debug mises à jour bloquées)."
      >
        <div className="rounded-xl border border-border bg-background/40 px-3 py-1.5">
          <Row label="Service worker" value={swStatus} />
          <Row label="Build chargé" value={build} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="destructive"
            className="gap-2"
            disabled={busy === "cache"}
            onClick={handleClearCache}
          >
            {busy === "cache" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Vider le cache & recharger
          </Button>
        </div>
      </Section>
    </div>
  );
}

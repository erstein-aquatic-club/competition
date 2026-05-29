import { Component, ErrorInfo, ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  /**
   * `fullscreen` (défaut) garde l'UI centrée plein écran historique (App.tsx).
   * `inline` rend une carte compacte à intégrer DANS une page/section : un
   * crash d'un sous-arbre ne détruit alors plus tout le shell de l'app.
   */
  variant?: "fullscreen" | "inline"
  /**
   * Dès qu'une valeur de ce tableau change, le boundary se réinitialise tout
   * seul (efface l'erreur + re-rend les enfants). Ex : `[athleteId]` → naviguer
   * vers un autre nageur récupère automatiquement après un crash.
   */
  resetKeys?: ReadonlyArray<unknown>
  /** Titre/description custom (variante inline). */
  title?: string
  description?: string
  /**
   * Libellé de contexte injecté dans le log prod (ex : "CoachSwimmerDetail").
   * Aide à retrouver QUEL sous-arbre a planté dans la console utilisateur.
   */
  context?: string
  /** Appelé en plus du reset interne quand l'utilisateur clique « Réessayer ». */
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
  isChunkError: boolean
}

function shallowArrayChanged(
  a?: ReadonlyArray<unknown>,
  b?: ReadonlyArray<unknown>,
): boolean {
  if (a === b) return false
  if (!a || !b) return a !== b
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return true
  return false
}

/**
 * ErrorBoundary attrape les erreurs React et affiche une UI de repli avec un
 * bouton « Réessayer ». Gère aussi les échecs de chargement de chunk (fréquents
 * après un déploiement quand un cache pointe vers d'anciens chunks).
 *
 * Deux variantes : `fullscreen` (App.tsx, reload page) et `inline` (sections,
 * reset sans reload + auto-reset via `resetKeys`).
 *
 * Important : on logue TOUJOURS en console (dev ET prod). Les crashes prod de
 * ce type récurrent (cf. §326/§330/§337) étaient jusqu'ici muets en prod → pas
 * de trace exploitable. Le log ci-dessous donne enfin un point d'entrée.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, isChunkError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Detect chunk loading errors (common after deployments)
    const isChunkError = /loading.*(chunk|module)|failed to fetch/i.test(error.message)
    return { hasError: true, error, isChunkError }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // TOUJOURS loguer (dev + prod). Sans ça, les crashes prod sont invisibles
    // et on ne peut pas diagnostiquer la récurrence (cf. note honnêteté §330).
    const label = this.props.context ? ` [${this.props.context}]` : ""
    // eslint-disable-next-line no-console
    console.error(
      `[EAC ErrorBoundary]${label}`,
      error,
      errorInfo?.componentStack,
    )
  }

  componentDidUpdate(prevProps: Props) {
    // Auto-reset quand les resetKeys changent (ex : navigation vers un autre
    // nageur) — uniquement si on est en état d'erreur, pour ne pas masquer un
    // crash persistant sur les mêmes données.
    if (
      this.state.hasError &&
      shallowArrayChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset()
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null, isChunkError: false })
  }

  handleReset = () => {
    this.reset()
    this.props.onReset?.()
    // Variante plein écran : reload pour repartir d'un état propre (comportement
    // historique). Variante inline : on se contente de re-rendre le sous-arbre.
    if ((this.props.variant ?? "fullscreen") === "fullscreen") {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const variant = this.props.variant ?? "fullscreen"

    if (variant === "inline") {
      return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <p className="text-sm font-semibold">
            {this.props.title ?? "Affichage indisponible"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {this.props.description ??
              "Cette section a rencontré un problème. Le reste de l'application reste utilisable."}
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-2 overflow-auto rounded-lg bg-destructive/5 p-2 text-left text-[10px] text-muted-foreground">
              {this.state.error.toString()}
            </pre>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="mt-3 gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réessayer
          </Button>
        </div>
      )
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {this.state.isChunkError
                ? "Mise à jour disponible"
                : "Une erreur est survenue"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {this.state.isChunkError
                ? "L'application a été mise à jour. Rechargez la page pour continuer."
                : "L'application a rencontré un problème inattendu."}
              <br />
              {!this.state.isChunkError && "Veuillez réessayer ou actualiser la page."}
            </p>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <details className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-left">
              <summary className="cursor-pointer text-sm font-medium text-destructive">
                Détails de l'erreur (dev only)
              </summary>
              <pre className="mt-2 overflow-auto text-xs text-muted-foreground">
                {this.state.error.toString()}
                {this.state.error.stack && `\n\n${this.state.error.stack}`}
              </pre>
            </details>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={this.handleReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Réessayer
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = "/"}
            >
              Retour à l'accueil
            </Button>
          </div>
        </div>
      </div>
    )
  }
}

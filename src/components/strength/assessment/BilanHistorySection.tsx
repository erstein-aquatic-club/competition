/**
 * BilanHistorySection — historique des bilans muscu d'un nageur + courbe
 * d'évolution mobilité G/D (§347, Slice B).
 *
 * - liste des bilans passés (date + badge de statut), récent en premier ;
 * - une ligne se déplie en lecture seule : par axe, libellé + Gauche/Droite
 *   0-3 + note d'axe, puis la note de synthèse globale ;
 * - sous la liste, `MobilityEvolutionChart` (visible dès ≥ 2 bilans notés).
 *
 * Lecture seule de bout en bout. La création d'un nouveau bilan reste pilotée
 * par l'écran parent (CTA `onStartNew`, branché sur le flux existant).
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  History,
  ChevronDown,
  Plus,
  Pencil,
  StickyNote,
  StretchHorizontal,
  Dumbbell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  StrengthAssessment,
  StrengthAssessmentStatus,
  StrengthPhysicalTestsNormalized,
} from "@/lib/api/types";
import { normalizePhysicalTests } from "@/lib/strength/physicalTests";
import { MobilityEvolutionChart } from "./MobilityEvolutionChart";

interface BilanHistorySectionProps {
  assessments: StrengthAssessment[];
  /** Démarrer un nouveau bilan — relié au flux `createAssessment` du parent. */
  onStartNew?: () => void;
  /** Désactive le CTA (mutation en cours, ou bilan déjà en cours). */
  startDisabled?: boolean;
  /** Éditer les scores physiques d'un bilan passé noté (§348). */
  onEdit?: (assessment: StrengthAssessment) => void;
}

const STATUS_META: Record<
  StrengthAssessmentStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  completed: { label: "Complété", variant: "default" },
  bilan_pending: { label: "À noter", variant: "secondary" },
  questionnaire_pending: { label: "Questionnaire", variant: "outline" },
};

const AXIS_LABELS: { group: "mobility" | "movement"; key: string; label: string }[] = [
  { group: "mobility", key: "shoulder_flexion", label: "Flexion d'épaule" },
  { group: "mobility", key: "t_spine", label: "Mobilité thoracique" },
  { group: "mobility", key: "hip", label: "Mobilité de hanche" },
  { group: "movement", key: "scapula_control", label: "Contrôle scapulaire" },
  { group: "movement", key: "trunk_neck_alignment", label: "Alignement tronc / nuque" },
  { group: "movement", key: "hip_hinge", label: "Charnière de hanche" },
];

/** Affichage lecture seule des scores G/D d'un bilan normalisé. */
function ReadOnlyScores({
  normalized,
}: {
  normalized: StrengthPhysicalTestsNormalized;
}) {
  return (
    <div className="mt-2 space-y-2.5 border-t pt-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <StretchHorizontal className="h-3.5 w-3.5" />
        Mobilité & mouvement
      </div>
      <div className="space-y-2">
        {AXIS_LABELS.map((axisDef) => {
          const group = normalized[axisDef.group] as Record<
            string,
            { left: number; right: number; note?: string }
          >;
          const axis = group[axisDef.key];
          if (!axis) return null;
          return (
            <div key={axisDef.key} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground">{axisDef.label}</span>
                <span className="flex items-center gap-1 font-mono tabular-nums">
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                    G {axis.left}
                  </span>
                  <span className="rounded-md bg-orange-500/10 px-1.5 py-0.5 font-semibold text-orange-600">
                    D {axis.right}
                  </span>
                </span>
              </div>
              {axis.note && (
                <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                  {axis.note}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {normalized.note && (
        <div className="rounded-lg bg-muted/40 p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <StickyNote className="h-3.5 w-3.5 text-primary" />
            Synthèse
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {normalized.note}
          </p>
        </div>
      )}
    </div>
  );
}

function BilanRow({
  assessment,
  onEdit,
}: {
  assessment: StrengthAssessment;
  onEdit?: (assessment: StrengthAssessment) => void;
}) {
  const [open, setOpen] = useState(false);
  const normalized = useMemo(
    () => normalizePhysicalTests(assessment.physical_tests ?? null),
    [assessment.physical_tests],
  );
  const meta = STATUS_META[assessment.status];
  const dateLabel = format(new Date(assessment.created_at), "d MMM yyyy", {
    locale: fr,
  });
  const expandable = normalized != null;

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => expandable && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
          expandable && "active:bg-muted/40",
        )}
      >
        <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/40">
          <span className="text-[13px] font-bold leading-none">
            {format(new Date(assessment.created_at), "dd")}
          </span>
          <span className="mt-0.5 text-[8px] font-semibold uppercase leading-tight text-muted-foreground">
            {format(new Date(assessment.created_at), "MMM", { locale: fr })}
          </span>
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-foreground">
            {dateLabel}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {expandable ? "Voir la notation" : "Aucune notation physique"}
          </p>
        </div>
        <Badge variant={meta.variant} className="shrink-0 text-[10px]">
          {meta.label}
        </Badge>
        {/* §348 — éditer les scores physiques d'un bilan noté. Rendu dans le
            <button> de la ligne : stopPropagation pour ne pas (dé)plier. */}
        {expandable && onEdit && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Éditer les scores du bilan"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(assessment);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onEdit(assessment);
              }
            }}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-95"
          >
            <Pencil className="h-3 w-3" />
            Éditer
          </span>
        )}
        {expandable && (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>
      {open && normalized && (
        <div className="px-3 pb-3">
          <ReadOnlyScores normalized={normalized} />
        </div>
      )}
    </div>
  );
}

export function BilanHistorySection({
  assessments,
  onStartNew,
  startDisabled,
  onEdit,
}: BilanHistorySectionProps) {
  const scoredCount = useMemo(
    () =>
      assessments.filter((a) => a.physical_tests != null).length,
    [assessments],
  );
  const canChart = scoredCount >= 2;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Historique des bilans
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {onStartNew && (
          <Button
            variant="outline"
            className="w-full rounded-xl"
            disabled={startDisabled}
            onClick={onStartNew}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Démarrer un nouveau bilan
          </Button>
        )}

        {assessments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucun bilan pour le moment.
          </p>
        ) : (
          <div className="space-y-2">
            {assessments.map((a) => (
              <BilanRow key={a.id} assessment={a} onEdit={onEdit} />
            ))}
          </div>
        )}

        {/* Courbe d'évolution mobilité G/D — visible dès ≥ 2 bilans notés */}
        {canChart && (
          <div className="border-t pt-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Dumbbell className="h-3.5 w-3.5 text-primary" />
              Évolution dans le temps
            </div>
            <MobilityEvolutionChart assessments={assessments} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

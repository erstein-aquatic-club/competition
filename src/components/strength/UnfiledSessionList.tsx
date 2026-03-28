import { StrengthSessionTemplate, Assignment } from "@/lib/api";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { staggerChildren } from "@/lib/animations";

export interface DisplaySession {
  key: string;
  title: string;
  description: string | null;
  type: "assignment" | "catalog";
  assignedDate?: string;
  session: StrengthSessionTemplate;
  assignment?: Assignment;
  exerciseCount: number;
}

interface UnfiledSessionListProps {
  sessions: DisplaySession[];
  onStartAssignment: (assignment: Assignment) => void;
  onStartCatalog: (session: StrengthSessionTemplate) => void;
}

const cardVariant = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
};

export function UnfiledSessionList({ sessions, onStartAssignment, onStartCatalog }: UnfiledSessionListProps) {
  if (sessions.length === 0) return null;

  return (
    <motion.div
      className="space-y-1.5 motion-reduce:animate-none"
      variants={staggerChildren}
      initial="hidden"
      animate="visible"
    >
      {sessions.map((session) => {
        const isAssignment = session.type === "assignment";
        return (
          <motion.button
            key={session.key}
            type="button"
            variants={cardVariant}
            className={cn(
              "group w-full rounded-xl border bg-card text-left transition-all active:scale-[0.98]",
              isAssignment ? "border-primary/20 hover:border-primary/40" : "hover:border-primary/30",
            )}
            onClick={() => {
              if (isAssignment && session.assignment) {
                onStartAssignment(session.assignment);
              } else {
                onStartCatalog(session.session);
              }
            }}
          >
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <div className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                isAssignment ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
              )}>
                <span className="text-sm font-bold">{session.exerciseCount}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-[13px] truncate leading-tight">{session.title}</p>
                  {isAssignment && (
                    <span className="shrink-0 inline-flex items-center rounded bg-primary/10 px-1 py-px text-[9px] font-bold uppercase text-primary">Coach</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums truncate">
                  {session.exerciseCount} ex.
                  {isAssignment && session.assignedDate && (
                    <><span className="text-muted-foreground/40"> · </span>{format(new Date(session.assignedDate), "dd MMM", { locale: fr })}</>
                  )}
                  {!isAssignment && session.description && (
                    <><span className="text-muted-foreground/40"> · </span><span className="truncate">{session.description}</span></>
                  )}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

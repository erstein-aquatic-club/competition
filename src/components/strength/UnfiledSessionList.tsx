import { StrengthSessionTemplate, Assignment } from "@/lib/api";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion, useReducedMotion } from "framer-motion";
import { staggerChildren } from "@/lib/animations";
import { SessionRow } from "@/components/shared/SessionRow";

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
  const reduce = useReducedMotion();
  const listVariants = reduce ? {} : staggerChildren;
  const itemVariants = reduce ? {} : cardVariant;
  if (sessions.length === 0) return null;

  return (
    <motion.div
      className="space-y-1.5 motion-reduce:animate-none"
      variants={listVariants}
      initial="hidden"
      animate="visible"
    >
      {sessions.map((session) => {
        const isAssignment = session.type === "assignment";
        const subtitle = [
          `${session.exerciseCount} ex.`,
          isAssignment && session.assignedDate
            ? format(new Date(session.assignedDate), "dd MMM", { locale: fr })
            : null,
          !isAssignment && session.description ? session.description : null,
        ].filter(Boolean).join(" · ");

        return (
          <motion.div key={session.key} variants={itemVariants}>
            <SessionRow
              title={session.title}
              subtitle={subtitle}
              badge={
                isAssignment ? (
                  <span className="shrink-0 inline-flex items-center rounded bg-primary/10 px-1 py-px text-[9px] font-bold uppercase text-primary">
                    Coach
                  </span>
                ) : undefined
              }
              onClick={() => {
                if (isAssignment && session.assignment) {
                  onStartAssignment(session.assignment);
                } else {
                  onStartCatalog(session.session);
                }
              }}
              className={cn(
                "rounded-xl border bg-card active:scale-[0.98]",
                isAssignment ? "border-primary/20 hover:border-primary/40" : "hover:border-primary/30",
              )}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

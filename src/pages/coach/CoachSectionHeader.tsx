import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type CoachSectionHeaderProps = {
  title: string;
  description?: string;
  onBack?: () => void;
  actions?: ReactNode;
};

const CoachSectionHeader = ({ title, description, onBack, actions }: CoachSectionHeaderProps) => (
  <div className="space-y-3">
    <div className="space-y-1">
      {onBack && (
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 h-11 w-11"
          onClick={onBack}
          aria-label="Retour"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </div>
);

export default CoachSectionHeader;

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
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
      )}
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </div>
);

export default CoachSectionHeader;

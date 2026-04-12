import { PageHeader } from "@/components/shared/PageHeader";
import { MessageSquare } from "lucide-react";
import AthleteInterviewsSection from "@/components/profile/AthleteInterviewsSection";

export default function SuiviEntretiens() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-24">
      <PageHeader
        title="Mes entretiens"
        icon={<MessageSquare className="h-3.5 w-3.5" />}
        backHref="/suivi"
        backLabel="Mon suivi"
      />
      <div className="pt-3">
        <AthleteInterviewsSection embedded />
      </div>
    </div>
  );
}

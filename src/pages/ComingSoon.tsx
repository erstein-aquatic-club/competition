import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

type ComingSoonProps = {
  title?: string;
  description?: string;
  params?: Record<string, string | undefined>;
};

export default function ComingSoon({
  title = "À venir",
  description = "Cette fonctionnalité arrive bientôt. Merci pour votre patience.",
}: ComingSoonProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-in fade-in motion-reduce:animate-none">
      <Card className="w-full max-w-sm border-dashed text-center">
        <CardHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-6 w-6" />
          </div>
          <CardTitle className="mt-4 text-2xl font-semibold tracking-tight text-primary">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nous finalisons cette section pour une prochaine mise à jour.
        </CardContent>
      </Card>
    </div>
  );
}

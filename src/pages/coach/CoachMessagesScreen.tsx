import { useMemo, useState } from "react";
import { BellRing, SendHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CoachSectionHeader from "./CoachSectionHeader";

type CoachMessagesScreenProps = {
  onBack?: () => void;
  athletes: Array<{ id: number | null; display_name: string; email?: string | null; group_id?: number | null; group_label?: string | null }>;
  groups: Array<{ id: number; name: string }>;
  athletesLoading: boolean;
};

const CoachMessagesScreen = ({ onBack, athletes, groups, athletesLoading }: CoachMessagesScreenProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [sending, setSending] = useState(false);

  const athleteOptions = useMemo(
    () =>
      athletes
        .filter((a) => a.id != null)
        .map((a) => ({
          value: `user:${a.id}`,
          label: a.group_label ? `${a.display_name} · ${a.group_label}` : a.display_name,
        })),
    [athletes],
  );

  const groupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: `group:${g.id}`,
        label: g.name,
        id: g.id,
      })),
    [groups],
  );

  const selectedTarget = useMemo(() => {
    if (!targetValue) {
      return {
        recipients: 0,
        target: null as { target_user_id?: number | null; target_group_id?: number | null } | null,
      };
    }

    if (targetValue.startsWith("user:")) {
      const userId = Number(targetValue.split(":")[1]);
      const athlete = athletes.find((item) => item.id === userId);
      if (!athlete?.id) {
        return { recipients: 0, target: null };
      }
      return {
        recipients: 1,
        target: { target_user_id: athlete.id, target_group_id: null },
      };
    }

    if (targetValue.startsWith("group:")) {
      const groupId = Number(targetValue.split(":")[1]);
      const recipients = athletes.filter((athlete) => athlete.group_id === groupId && athlete.id != null).length;
      return {
        recipients,
        target: { target_group_id: groupId, target_user_id: null },
      };
    }

    return { recipients: 0, target: null };
  }, [athletes, targetValue]);

  const handleSendMessage = async () => {
    if (!selectedTarget.target || selectedTarget.recipients === 0) {
      toast({
        title: "Aucun destinataire",
        description: "Choisissez un groupe ou un nageur avec au moins un compte actif.",
        variant: "destructive",
      });
      return;
    }
    if (!title.trim()) {
      toast({
        title: "Titre requis",
        description: "Ajoutez un titre avant d'envoyer la notification.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const result = await api.notifications_send({
        title: title.trim(),
        body: message.trim() || null,
        type: "message",
        targets: [selectedTarget.target],
      });

      toast({
        title: "Notification envoyée",
        description:
          selectedTarget.recipients === 1
            ? "Le nageur recevra la notification sur ses appareils abonnés."
            : `${selectedTarget.recipients} nageurs ciblés recevront la notification sur leurs appareils abonnés.`,
      });

      setTitle("");
      setMessage("");
      setTargetValue("");
    } catch (error) {
      toast({
        title: "Envoi impossible",
        description: error instanceof Error ? error.message : "La notification n'a pas pu être envoyée.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <CoachSectionHeader
        title="Envoyer un message"
        description="Crée une notification push (FCM) pour un groupe ou un nageur."
        onBack={onBack}
      />

      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle>Destinataire</CardTitle>
          <CardDescription>Sélectionnez un groupe complet ou un nageur individuel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Destinataire</Label>
            <Select value={targetValue} onValueChange={setTargetValue}>
              <SelectTrigger>
                <SelectValue placeholder={athletesLoading ? "Chargement..." : "Choisir un nageur ou un groupe"} />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.length ? (
                  <>
                    <SelectItem value="section-group" disabled>
                      Groupes
                    </SelectItem>
                    {groupOptions.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </>
                ) : null}
                {athleteOptions.length ? (
                  <>
                    <SelectItem value="section-athlete" disabled>
                      Nageurs
                    </SelectItem>
                    {athleteOptions.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          {targetValue && selectedTarget.recipients > 0 ? (
            <p className="text-xs text-muted-foreground">
              {selectedTarget.recipients} nageur{selectedTarget.recipients > 1 ? "s" : ""} ciblé{selectedTarget.recipients > 1 ? "s" : ""}
            </p>
          ) : null}
          {targetValue && selectedTarget.recipients === 0 ? (
            <p className="text-xs text-destructive">
              Aucun nageur actif n'est rattaché à cette sélection.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification</CardTitle>
          <CardDescription>Le titre apparaît dans la push, le message reste optionnel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="coach-message-title">Titre</Label>
            <Input
              id="coach-message-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Changement d'horaire demain"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coach-message-body">Message</Label>
            <Textarea
              id="coach-message-body"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ajoutez les détails à afficher dans la notification…"
              rows={4}
              maxLength={2000}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/20">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            L'envoi crée aussi une notification dans l'application. Les appareils avec les push activées la recevront immédiatement.
          </p>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 p-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:p-0">
        <Button
          className="w-full sm:w-auto"
          onClick={handleSendMessage}
          disabled={!selectedTarget.target || selectedTarget.recipients === 0 || !title.trim() || sending}
        >
          {sending ? (
            <>
              <BellRing className="mr-2 h-4 w-4" />
              Envoi...
            </>
          ) : (
            <>
              <SendHorizontal className="mr-2 h-4 w-4" />
              Envoyer la notification
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default CoachMessagesScreen;

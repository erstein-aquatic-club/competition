import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BellRing, SendHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CoachMessagesScreenProps = {
  onBack?: () => void;
  athletes: Array<{ id: number | null; display_name: string; email?: string | null; group_id?: number | null; group_label?: string | null }>;
  groups: Array<{ id: number; name: string }>;
  athletesLoading: boolean;
  initialAthleteId?: number | null;
};

const CoachMessagesScreen = ({
  onBack,
  athletes,
  groups,
  athletesLoading,
  initialAthleteId,
}: CoachMessagesScreenProps) => {
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

  useEffect(() => {
    if (initialAthleteId == null) return;
    if (!athletes.some((athlete) => athlete.id === initialAthleteId)) return;
    setTargetValue(`user:${initialAthleteId}`);
  }, [athletes, initialAthleteId]);

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
      await api.notifications_send({
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
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div>
        {onBack ? (
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour
          </Button>
        ) : null}
        <h2 className="text-2xl font-display font-semibold uppercase italic text-primary">
          Envoyer un message
        </h2>
      </div>

      {/* Destinataire */}
      <div className="space-y-1.5">
        <Label htmlFor="coach-msg-target">Destinataire</Label>
        <Select value={targetValue} onValueChange={setTargetValue}>
          <SelectTrigger id="coach-msg-target">
            <SelectValue placeholder={athletesLoading ? "Chargement..." : "Choisir un nageur ou un groupe"} />
          </SelectTrigger>
          <SelectContent>
            {groupOptions.length ? (
              <>
                <SelectItem value="section-group" disabled>Groupes</SelectItem>
                {groupOptions.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </>
            ) : null}
            {athleteOptions.length ? (
              <>
                <SelectItem value="section-athlete" disabled>Nageurs</SelectItem>
                {athleteOptions.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </>
            ) : null}
          </SelectContent>
        </Select>
        {targetValue && selectedTarget.recipients > 0 ? (
          <p className="text-xs text-muted-foreground">
            {selectedTarget.recipients} nageur{selectedTarget.recipients > 1 ? "s" : ""} ciblé{selectedTarget.recipients > 1 ? "s" : ""}
          </p>
        ) : null}
        {targetValue && selectedTarget.recipients === 0 ? (
          <p className="text-xs text-destructive">Aucun nageur actif n'est rattaché à cette sélection.</p>
        ) : null}
      </div>

      {/* Titre */}
      <div className="space-y-1.5">
        <Label htmlFor="coach-message-title">
          Titre <span className="text-destructive" aria-hidden="true">*</span>
        </Label>
        <Input
          id="coach-message-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. Changement d'horaire demain"
          maxLength={200}
        />
      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <Label htmlFor="coach-message-body">
          Message <span className="text-muted-foreground font-normal">(optionnel)</span>
        </Label>
        <Textarea
          id="coach-message-body"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ajoutez les détails à afficher dans la notification…"
          rows={3}
          maxLength={2000}
        />
      </div>

      {/* CTA sticky */}
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

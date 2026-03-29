import { useMemo, useState } from "react";
import { Copy, ExternalLink, Check, ChevronsUpDown, X, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import CoachSectionHeader from "./CoachSectionHeader";
import { buildSmsUri, canOpenSmsApp } from "@/lib/smsUtils";

type CoachSmsScreenProps = {
  onBack?: () => void;
  athletes: Array<{ id: number | null; display_name: string; email?: string | null; group_id?: number | null; group_label?: string | null }>;
  groups: Array<{ id: number; name: string }>;
  athletesLoading: boolean;
};

const CoachSmsScreen = ({ onBack, athletes, groups, athletesLoading }: CoachSmsScreenProps) => {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);

  const { data: athletePhones } = useQuery({
    queryKey: ["athlete-phones"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("user_id, phone")
        .not("phone", "is", null);
      return new Map((data ?? []).map((p: any) => [p.user_id as number, p.phone as string]));
    },
  });

  const missingPhoneAthletes = useMemo(() => {
    if (!athletePhones) return [];
    return athletes
      .filter((a) => a.id != null && selectedUsers.has(a.id) && !athletePhones.has(a.id!))
      .map((a) => a.display_name);
  }, [athletes, selectedUsers, athletePhones]);

  const athleteOptions = useMemo(
    () =>
      athletes
        .filter((a) => a.id != null)
        .map((a) => ({
          id: a.id!,
          display_name: a.display_name,
          group_id: a.group_id ?? null,
          group_label: a.group_label ?? null,
        })),
    [athletes],
  );

  const toggleGroup = (groupId: number) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleUser = (userId: number) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const clearAll = () => {
    setSelectedGroups(new Set());
    setSelectedUsers(new Set());
  };

  // Resolve all unique phone numbers from selection
  const { selectedPhones, selectedTotal, missingCount } = useMemo(() => {
    if (!athletePhones) return { selectedPhones: [] as string[], selectedTotal: 0, missingCount: 0 };

    const userIds = new Set<number>();

    // Add users from selected groups
    for (const groupId of selectedGroups) {
      for (const a of athleteOptions) {
        if (a.group_id === groupId) userIds.add(a.id);
      }
    }

    // Add individually selected users
    for (const userId of selectedUsers) {
      userIds.add(userId);
    }

    const total = userIds.size;
    const phones: string[] = [];
    for (const uid of userIds) {
      const phone = athletePhones.get(uid);
      if (phone && phone.trim().length > 0) phones.push(phone);
    }

    return { selectedPhones: phones, selectedTotal: total, missingCount: total - phones.length };
  }, [selectedGroups, selectedUsers, athleteOptions, athletePhones]);

  const selectionCount = selectedGroups.size + selectedUsers.size;

  const selectionSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedGroups.size > 0) {
      parts.push(`${selectedGroups.size} groupe${selectedGroups.size > 1 ? "s" : ""}`);
    }
    if (selectedUsers.size > 0) {
      parts.push(`${selectedUsers.size} nageur${selectedUsers.size > 1 ? "s" : ""}`);
    }
    return parts.join(", ");
  }, [selectedGroups.size, selectedUsers.size]);

  const handleSendSms = () => {
    if (selectedPhones.length === 0) {
      toast({
        title: "Aucun numéro",
        description: "Aucun nageur avec un numéro de téléphone dans cette sélection.",
        variant: "destructive",
      });
      return;
    }

    if (canOpenSmsApp()) {
      const uri = buildSmsUri(selectedPhones, message.trim() || undefined);
      window.location.href = uri;
    } else {
      navigator.clipboard.writeText(selectedPhones.join(", ")).then(() => {
        toast({
          title: "Numéros copiés",
          description: `${selectedPhones.length} numéro${selectedPhones.length > 1 ? "s" : ""} copié${selectedPhones.length > 1 ? "s" : ""} dans le presse-papiers.`,
        });
      }).catch(() => {
        toast({ title: "Erreur", description: "Impossible de copier les numéros.", variant: "destructive" });
      });
    }
  };

  const canSms = canOpenSmsApp();

  return (
    <div className="space-y-6 pb-24">
      <CoachSectionHeader
        title="Envoyer un SMS"
        description="Ouvre votre application SMS ou copie les numéros."
        onBack={onBack}
      />

      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle>Destinataires</CardTitle>
          <CardDescription>Sélectionnez des groupes et/ou des nageurs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Destinataires</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between font-normal"
              >
                <span className="truncate">
                  {selectionCount > 0
                    ? selectionSummary
                    : athletesLoading
                      ? "Chargement..."
                      : "Choisir des destinataires"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command>
                <CommandInput placeholder="Rechercher..." />
                <CommandList>
                  <CommandEmpty>Aucun résultat.</CommandEmpty>
                  {groups.length > 0 && (
                    <CommandGroup heading="Groupes">
                      {groups.map((g) => (
                        <CommandItem
                          key={`group:${g.id}`}
                          value={`groupe ${g.name}`}
                          onSelect={() => toggleGroup(g.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedGroups.has(g.id) ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {g.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {athleteOptions.length > 0 && (
                    <CommandGroup heading="Nageurs">
                      {athleteOptions.map((a) => (
                        <CommandItem
                          key={`user:${a.id}`}
                          value={`nageur ${a.display_name} ${a.group_label ?? ""}`}
                          onSelect={() => toggleUser(a.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedUsers.has(a.id) ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{a.display_name}</span>
                          {a.group_label && (
                            <span className="ml-auto text-xs text-muted-foreground">{a.group_label}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectionCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {[...selectedGroups].map((gid) => {
                const g = groups.find((gr) => gr.id === gid);
                return g ? (
                  <Badge key={`g:${gid}`} variant="secondary" className="gap-1 pr-1">
                    {g.name}
                    <button
                      type="button"
                      onClick={() => toggleGroup(gid)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null;
              })}
              {[...selectedUsers].map((uid) => {
                const a = athleteOptions.find((at) => at.id === uid);
                return a ? (
                  <Badge key={`u:${uid}`} variant="outline" className="gap-1 pr-1">
                    {a.display_name}
                    <button
                      type="button"
                      onClick={() => toggleUser(uid)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null;
              })}
              {selectionCount > 1 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Tout effacer
                </button>
              )}
            </div>
          )}

          {selectionCount > 0 && selectedPhones.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedPhones.length} numéro{selectedPhones.length > 1 ? "s" : ""} trouvé{selectedPhones.length > 1 ? "s" : ""}
              {missingCount > 0 && (
                <span className="text-destructive"> · {missingCount} sans téléphone</span>
              )}
            </p>
          )}
          {selectionCount > 0 && selectedPhones.length === 0 && (
            <p className="text-xs text-destructive">
              Aucun numéro de téléphone disponible pour cette sélection.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
          <CardDescription>Optionnel — pré-rempli dans votre application SMS.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Contenu du SMS…"
            rows={3}
          />
        </CardContent>
      </Card>

      {missingPhoneAthletes.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            {missingPhoneAthletes.length} nageur(s) sans numéro de téléphone :
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            {missingPhoneAthletes.join(", ")}
          </p>
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 p-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:p-0">
        <Button
          className="w-full sm:w-auto"
          onClick={handleSendSms}
          disabled={selectionCount === 0 || selectedPhones.length === 0}
        >
          {canSms ? (
            <>
              <Smartphone className="mr-2 h-4 w-4" />
              Ouvrir dans Messages
              <ExternalLink className="ml-2 h-3 w-3" />
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copier les numéros
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default CoachSmsScreen;

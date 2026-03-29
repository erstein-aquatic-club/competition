import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, UserPlus } from "lucide-react";

interface Props {
  compact?: boolean;
}

export function PendingApprovals({ compact = false }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const role = useAuth((s) => s.role);

  const { data: pending = [] } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("user_id, users!inner(id, display_name, email, role)")
        .eq("is_approved", false);
      return (data ?? []).map((row: any) => ({
        userId: row.user_id as number,
        name: (row.users as any)?.display_name ?? "\u2014",
        email: (row.users as any)?.email ?? "\u2014",
        role: (row.users as any)?.role ?? "\u2014",
      }));
    },
    enabled: role === "admin" || role === "coach" || role === "comite",
  });

  const approveMut = useMutation({
    mutationFn: async (userId: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: "approve_user", user_id: userId }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      toast({ title: "Utilisateur approuv\u00e9" });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'approuver.", variant: "destructive" });
    },
  });

  const rejectMut = useMutation({
    mutationFn: async (userId: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: "reject_user", user_id: userId }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      toast({ title: "Inscription rejet\u00e9e" });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de rejeter.", variant: "destructive" });
    },
  });

  if (pending.length === 0) return null;

  if (compact) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-center gap-3">
        <UserPlus className="h-5 w-5 text-amber-600" />
        <div className="flex-1">
          <p className="text-sm font-medium">{pending.length} inscription(s) en attente</p>
        </div>
        <div className="flex gap-1">
          {pending.slice(0, 2).map((p) => (
            <div key={p.userId} className="flex items-center gap-1">
              <span className="text-xs truncate max-w-20">{p.name}</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600" onClick={() => approveMut.mutate(p.userId)}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => rejectMut.mutate(p.userId)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Inscriptions en attente</h3>
        <Badge variant="destructive" className="text-xs">{pending.length}</Badge>
      </div>
      {pending.map((p) => (
        <div key={p.userId} className="flex items-center gap-3 rounded-xl border p-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{p.name}</p>
            <p className="text-xs text-muted-foreground truncate">{p.email} &middot; {p.role}</p>
          </div>
          <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300" onClick={() => approveMut.mutate(p.userId)} disabled={approveMut.isPending}>
            <Check className="mr-1 h-3.5 w-3.5" /> Approuver
          </Button>
          <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => rejectMut.mutate(p.userId)} disabled={rejectMut.isPending}>
            <X className="mr-1 h-3.5 w-3.5" /> Rejeter
          </Button>
        </div>
      ))}
    </div>
  );
}

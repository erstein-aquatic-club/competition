import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { assignSessionToSlotAsSub } from '@/lib/api/coach-quickview';
import { getSwimCatalog } from '@/lib/api/swim';
import { useQuery } from '@tanstack/react-query';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slotId: number;
  athleteId: number;
  timeSlot?: string | null;
  onSuccess: () => void;
};

export default function QuickViewAssignDrawer({ open, onOpenChange, slotId, athleteId, timeSlot, onSuccess }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adHocName, setAdHocName] = useState('');
  const [adHocDesc, setAdHocDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: catalog = [] } = useQuery({
    queryKey: ['swim-catalog'],
    queryFn: getSwimCatalog,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = catalog.filter(s =>
    !s.is_archived &&
    (search.trim() === '' || s.name.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleAssignLibrary() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await assignSessionToSlotAsSub({ slotId, athleteId, catalogSessionId: selectedId, scheduledSlot: timeSlot ?? undefined });
      toast({ title: 'Séance assignée' });
      queryClient.invalidateQueries({ queryKey: ['coach-quickview-briefing', athleteId] });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignAdHoc() {
    if (!adHocName.trim()) return;
    setSaving(true);
    try {
      // Create ad-hoc catalog entry then assign it
      const { supabase } = await import('@/lib/api/client');
      const { data: newSession, error } = await supabase
        .from('swim_sessions_catalog')
        .insert({ name: adHocName.trim(), description: adHocDesc.trim() || null })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      await assignSessionToSlotAsSub({ slotId, athleteId, catalogSessionId: newSession.id, scheduledSlot: timeSlot ?? undefined });
      toast({ title: 'Séance créée et assignée' });
      queryClient.invalidateQueries({ queryKey: ['coach-quickview-briefing', athleteId] });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const slotLabel = timeSlot ? ` ${timeSlot}` : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] flex flex-col rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Assigner une séance{slotLabel && ` — créneau ${slotLabel}`}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="library" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-2 mb-3">
            <TabsTrigger value="library">Bibliothèque</TabsTrigger>
            <TabsTrigger value="adhoc">Nouvelle</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="flex-1 flex flex-col overflow-hidden gap-3">
            <Input
              placeholder="Rechercher une séance…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="shrink-0"
            />
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Aucune séance trouvée.</p>
              )}
              {filtered.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    s.id === selectedId
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <p className="text-sm font-medium">{s.name}</p>
                  {s.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                  )}
                </button>
              ))}
            </div>
            <div className="shrink-0 pb-safe">
              <Button
                className="w-full rounded-xl"
                disabled={!selectedId || saving}
                onClick={handleAssignLibrary}
              >
                {saving ? 'Assignation…' : `Assigner au créneau${slotLabel}`}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="adhoc" className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-name" className="text-xs text-muted-foreground">Titre *</Label>
              <Input
                id="adhoc-name"
                value={adHocName}
                onChange={e => setAdHocName(e.target.value)}
                placeholder="Ex: Technique dos crawlé"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-desc" className="text-xs text-muted-foreground">Contenu (optionnel)</Label>
              <Textarea
                id="adhoc-desc"
                rows={4}
                value={adHocDesc}
                onChange={e => setAdHocDesc(e.target.value)}
                placeholder="Échauffement, séries, récupération…"
                className="resize-none text-sm"
                maxLength={1000}
              />
            </div>
            <div className="pb-safe">
              <Button
                className="w-full rounded-xl"
                disabled={!adHocName.trim() || saving}
                onClick={handleAssignAdHoc}
              >
                {saving ? 'Création…' : `Créer et assigner${slotLabel}`}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

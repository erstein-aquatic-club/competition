import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { recordAttendanceAsSub, type AttendanceStatus } from '@/lib/api/coach-quickview';
import { supabase } from '@/lib/api/client';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dimSessionId: number;
  athleteId: number;
  onSuccess: () => void;
};

const OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Présent' },
  { value: 'absent',  label: 'Absent'  },
  { value: 'late',    label: 'Retard'  },
];

export default function QuickViewAttendanceDialog({ open, onOpenChange, dimSessionId, athleteId, onSuccess }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    setSaving(true);
    try {
      await recordAttendanceAsSub({ dimSessionId, athleteId, status, recordedBy: user.id, comment: comment || undefined });
      toast({ title: 'Présence enregistrée' });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Enregistrer la présence</DialogTitle>
        </DialogHeader>

        <RadioGroup value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)} className="space-y-2 py-2">
          {OPTIONS.map(opt => (
            <div key={opt.value} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer has-[:checked]:bg-primary/5 has-[:checked]:border-primary/30">
              <RadioGroupItem value={opt.value} id={`att-${opt.value}`} />
              <Label htmlFor={`att-${opt.value}`} className="cursor-pointer font-medium">
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>

        <div className="space-y-1.5">
          <Label htmlFor="att-comment" className="text-xs text-muted-foreground">
            Commentaire (optionnel, max 200 car.)
          </Label>
          <Textarea
            id="att-comment"
            rows={2}
            maxLength={200}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Ex: arrivée en retard, blessure légère…"
            className="resize-none text-sm"
          />
          <p className="text-[10px] text-muted-foreground text-right">{comment.length}/200</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
